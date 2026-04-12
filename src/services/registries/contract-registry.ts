import { databaseService } from '../database.js';

class ContractRegistry {
  private contractNameByAccountId = new Map<number, string>();
  private methodIdByKey = new Map<string, number>();
  private methodById = new Map<number, { contractName: string; methodName: string }>();
  private loaded = false;

  async load(): Promise<void> {
    const db = databaseService.getDb();
    this.contractNameByAccountId.clear();
    this.methodIdByKey.clear();
    this.methodById.clear();

    const contracts = await db('nom_contracts').select('name', 'account_id');
    for (const c of contracts) {
      if (c.account_id != null) {
        this.contractNameByAccountId.set(c.account_id, c.name);
      }
    }

    const methods = await db('nom_contract_methods')
      .leftJoin('nom_contracts', 'nom_contract_methods.contract_id', 'nom_contracts.id')
      .select(
        'nom_contract_methods.id',
        'nom_contract_methods.name',
        'nom_contract_methods.fingerprint',
        'nom_contracts.name as contract_name',
      );
    for (const m of methods) {
      const name = m.contract_name ?? 'Common';
      this.methodIdByKey.set(this.key(name, m.fingerprint), m.id);
      this.methodById.set(m.id, { contractName: name, methodName: m.name });
    }

    this.loaded = true;
    console.log(
      `✓ Contract registry loaded: ${contracts.length} contracts, ${methods.length} methods`,
    );
  }

  getContractName(accountId: number): string {
    return this.contractNameByAccountId.get(accountId) ?? 'Common';
  }

  getMethodId(contractName: string, fingerprint: string): number | null {
    return this.methodIdByKey.get(this.key(contractName, fingerprint)) ?? null;
  }

  getMethod(methodId: number): { contractName: string; methodName: string } | undefined {
    return this.methodById.get(methodId);
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  private key(contractName: string, fingerprint: string): string {
    return `${contractName}|${fingerprint}`;
  }
}

export const contractRegistry = new ContractRegistry();
