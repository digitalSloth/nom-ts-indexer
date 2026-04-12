import { db } from './knex.js';

/**
 * Auto-Partitioning Configuration
 * Height-based partitioning for large tables
 */
const PARTITION_CONFIG = {
  nom_momentums: {
    threshold: 5_000_000, // partition when table reaches 5M rows
    rangeSize: 1_000_000, // 1M momentums per partition
    partitionColumn: 'height',
  },
  nom_account_blocks: {
    threshold: 5_000_000,
    rangeSize: 1_000_000,
    partitionColumn: 'height', // uses momentum height (via momentumId FK)
  },
} as const;

type TableName = keyof typeof PARTITION_CONFIG;

/**
 * Partition Manager
 * Automatically converts tables to partitioned when they reach threshold
 * Creates future partitions proactively
 *
 * NOTE: PostgreSQL only - other databases will skip partitioning gracefully
 */
export class PartitionManager {
  private lastCheck = new Map<string, Date>();
  private checkInterval = 3600000; // Check every hour (1 hour in ms)
  private isPartitioned = new Map<string, boolean>();
  private isPostgreSQL: boolean | null = null;

  /**
   * Check if tables need partitioning and create partitions if needed
   * Safe to call repeatedly - uses interval throttling
   * Skips gracefully on non-PostgreSQL databases
   */
  async checkAndPartition(): Promise<void> {
    // Check database type (only once)
    if (this.isPostgreSQL === null) {
      this.isPostgreSQL = await this.checkIsPostgreSQL();

      if (!this.isPostgreSQL) {
        console.log('⚠️  Auto-partitioning is only supported on PostgreSQL');
        console.log('   Tables will not be partitioned (not recommended for production scale)\n');
        return;
      }
    }

    // Skip if not PostgreSQL
    if (!this.isPostgreSQL) {
      return;
    }

    for (const [tableName, config] of Object.entries(PARTITION_CONFIG)) {
      // Throttle checks to avoid overhead
      const lastCheck = this.lastCheck.get(tableName);
      if (lastCheck && Date.now() - lastCheck.getTime() < this.checkInterval) {
        continue;
      }

      try {
        const isPartitioned = await this.isTablePartitioned(tableName);
        this.isPartitioned.set(tableName, isPartitioned);

        if (!isPartitioned) {
          // Check if threshold reached
          const rowCount = await this.getRowCount(tableName);

          if (rowCount >= config.threshold) {
            console.log(
              `\n🔄 Table ${tableName} has ${rowCount.toLocaleString()} rows (threshold: ${config.threshold.toLocaleString()})`,
            );
            console.log(`   Converting to partitioned table...\n`);
            await this.convertToPartitioned(tableName as TableName, config);
            this.isPartitioned.set(tableName, true);
            console.log(`✅ Partitioning complete for ${tableName}\n`);
          }
        } else {
          // Already partitioned - ensure future partitions exist
          await this.ensureFuturePartitions(tableName as TableName, config);
        }

        this.lastCheck.set(tableName, new Date());
      } catch (error) {
        console.error(`❌ Error checking partitions for ${tableName}:`, error);
        // Don't throw - allow indexer to continue
      }
    }
  }

  /**
   * Check if database is PostgreSQL
   */
  private async checkIsPostgreSQL(): Promise<boolean> {
    try {
      const result = await db.raw('SELECT version()');
      const version = result.rows[0]?.version || '';
      return version.toLowerCase().includes('postgresql');
    } catch {
      return false;
    }
  }

  /**
   * Check if table is already partitioned
   */
  private async isTablePartitioned(tableName: string): Promise<boolean> {
    const result = await db.raw(
      `SELECT EXISTS (
        SELECT 1 FROM pg_partitioned_table pt
        JOIN pg_class c ON pt.partrelid = c.oid
        WHERE c.relname = ?
      ) as is_partitioned`,
      [tableName],
    );
    return result.rows[0]?.is_partitioned || false;
  }

  /**
   * Get approximate row count (fast - uses pg statistics)
   */
  private async getRowCount(tableName: string): Promise<number> {
    const result = await db.raw(
      `SELECT reltuples::BIGINT as reltuples FROM pg_class WHERE relname = ?`,
      [tableName],
    );
    return result.rows[0]?.reltuples || 0;
  }

  /**
   * Convert existing table to partitioned table
   * This is a ONE-TIME operation per table
   */
  private async convertToPartitioned(
    tableName: TableName,
    config: (typeof PARTITION_CONFIG)[TableName],
  ): Promise<void> {
    console.log(`⚙️  Converting ${tableName} to partitioned table...`);
    console.log(`   This may take 2-5 minutes for large tables.`);
    console.log(`   DO NOT STOP THE INDEXER.\n`);

    const startTime = Date.now();

    try {
      await db.transaction(async (tx) => {
        // Step 1: Rename existing table
        await tx.raw(`ALTER TABLE ${tableName} RENAME TO ${tableName}_old`);
        console.log(`   ✓ Renamed ${tableName} → ${tableName}_old`);

        // Step 2: Get table structure
        const columns = await this.getTableColumns(tx, `${tableName}_old`);
        const pkColumns = await this.getPrimaryKeyColumns(tx, `${tableName}_old`);
        const indexes = await this.getTableIndexes(tx, `${tableName}_old`);

        // Step 3: Create partitioned parent table
        await this.createPartitionedParent(
          tx,
          tableName,
          columns,
          pkColumns,
          config.partitionColumn,
        );
        console.log(`   ✓ Created partitioned parent table`);

        // Step 4: Determine data range and create partitions
        const { minHeight, maxHeight } = await this.getHeightRange(tx, `${tableName}_old`);
        await this.createHeightPartitions(tx, tableName, config.rangeSize, minHeight, maxHeight);
        console.log(
          `   ✓ Created ${Math.ceil((maxHeight - minHeight) / config.rangeSize) + 2} partitions`,
        );

        // Step 5: Copy data from old table
        console.log(`   ⏳ Migrating data...`);
        await tx.raw(`INSERT INTO ${tableName} SELECT * FROM ${tableName}_old`);
        console.log(`   ✓ Data migration complete`);

        // Step 6: Recreate indexes
        await this.recreateIndexes(tx, tableName, indexes);
        console.log(`   ✓ Recreated ${indexes.length} indexes`);

        // Step 7: Drop old table
        await tx.raw(`DROP TABLE ${tableName}_old`);
        console.log(`   ✓ Dropped old table`);
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`   ⏱️  Completed in ${duration}s`);
    } catch (error) {
      console.error(`\n❌ Partitioning failed for ${tableName}:`, error);
      console.error(`   The table may need manual recovery. Check for ${tableName}_old`);
      throw error;
    }
  }

  /**
   * Get table column definitions
   */
  private async getTableColumns(tx: any, tableName: string): Promise<any[]> {
    const result = await tx.raw(
      `SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_name = ?
       ORDER BY ordinal_position`,
      [tableName],
    );
    return result.rows;
  }

  /**
   * Get primary key columns
   */
  private async getPrimaryKeyColumns(tx: any, tableName: string): Promise<string[]> {
    const result = await tx.raw(
      `SELECT string_agg(a.attname, ', ' ORDER BY array_position(i.indkey, a.attnum)) as columns
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       WHERE i.indrelid = ?::regclass AND i.indisprimary`,
      [tableName],
    );
    return result.rows[0]?.columns?.split(', ') || ['id'];
  }

  /**
   * Get table indexes
   */
  private async getTableIndexes(tx: any, tableName: string): Promise<any[]> {
    const result = await tx.raw(
      `SELECT indexname, indexdef
       FROM pg_indexes
       WHERE tablename = ? AND indexname NOT LIKE '%pkey'`,
      [tableName],
    );
    return result.rows;
  }

  /**
   * Get min/max height from table
   */
  private async getHeightRange(
    tx: any,
    tableName: string,
  ): Promise<{ minHeight: number; maxHeight: number }> {
    const result = await tx.raw(
      `SELECT COALESCE(MIN(height), 0) as min_height, COALESCE(MAX(height), 0) as max_height
       FROM ${tableName}`,
    );
    return {
      minHeight: Number(result.rows[0]?.min_height || 0),
      maxHeight: Number(result.rows[0]?.max_height || 0),
    };
  }

  /**
   * Create partitioned parent table
   */
  private async createPartitionedParent(
    tx: any,
    tableName: string,
    columns: any[],
    pkColumns: string[],
    partitionColumn: string,
  ): Promise<void> {
    const columnDefs = columns
      .map((col) => {
        let def = `${col.column_name} ${col.data_type}`;
        if (col.character_maximum_length) {
          def += `(${col.character_maximum_length})`;
        }
        if (col.is_nullable === 'NO') {
          def += ' NOT NULL';
        }
        if (col.column_default && !col.column_default.includes('nextval')) {
          def += ` DEFAULT ${col.column_default}`;
        }
        return def;
      })
      .join(',\n    ');

    const pkDef = pkColumns.includes(partitionColumn)
      ? pkColumns.join(', ')
      : `${pkColumns.join(', ')}, ${partitionColumn}`;

    await tx.raw(`
      CREATE TABLE ${tableName} (
        ${columnDefs},
        PRIMARY KEY (${pkDef})
      ) PARTITION BY RANGE (${partitionColumn})
    `);
  }

  /**
   * Create height-based partitions
   */
  private async createHeightPartitions(
    tx: any,
    tableName: string,
    rangeSize: number,
    minHeight: number,
    maxHeight: number,
  ): Promise<void> {
    let currentHeight = 0;
    const endHeight = maxHeight + rangeSize * 2;

    while (currentHeight < endHeight) {
      const nextHeight = currentHeight + rangeSize;
      const partitionName = `${tableName}_${currentHeight}_${nextHeight}`;

      await tx.raw(`
        CREATE TABLE ${partitionName} PARTITION OF ${tableName}
        FOR VALUES FROM (${currentHeight}) TO (${nextHeight})
      `);

      currentHeight = nextHeight;
    }
  }

  /**
   * Recreate indexes on partitioned table
   */
  private async recreateIndexes(tx: any, tableName: string, indexes: any[]): Promise<void> {
    for (const idx of indexes) {
      const oldTablePattern = new RegExp(`ON [^ ]+_old`, 'g');
      const newDef = idx.indexdef.replace(oldTablePattern, `ON ${tableName}`);

      try {
        await tx.raw(newDef);
      } catch (error) {
        console.warn(`   ⚠️  Could not recreate index ${idx.indexname}:`, error);
      }
    }
  }

  /**
   * Ensure future partitions exist (for already-partitioned tables)
   */
  private async ensureFuturePartitions(
    tableName: TableName,
    config: (typeof PARTITION_CONFIG)[TableName],
  ): Promise<void> {
    const result = await db.raw(`SELECT COALESCE(MAX(height), 0) as max_height FROM ${tableName}`);
    const maxHeight = Number(result.rows[0]?.max_height || 0);

    const rangeSize = config.rangeSize;
    const currentRangeStart = Math.floor(maxHeight / rangeSize) * rangeSize;

    for (let i = 0; i <= 2; i++) {
      const startHeight = currentRangeStart + rangeSize * i;
      const endHeight = startHeight + rangeSize;
      const partitionName = `${tableName}_${startHeight}_${endHeight}`;

      try {
        await db.raw(`
          CREATE TABLE IF NOT EXISTS ${partitionName} PARTITION OF ${tableName}
          FOR VALUES FROM (${startHeight}) TO (${endHeight})
        `);
      } catch {
        // Partition might already exist - that's fine
      }
    }
  }
}

// Export singleton instance
export const partitionManager = new PartitionManager();
