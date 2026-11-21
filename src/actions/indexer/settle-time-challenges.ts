/**
 * Sets `expires_at` on the time challenges whose delay ends with this
 * momentum: a challenge can be answered from the first momentum after its
 * end height.
 */
export async function settleTimeChallenges(
  tx: any,
  height: bigint,
  createdAt: Date,
): Promise<void> {
  await tx('nom_time_challenges')
    .where({ end_height: height - 1n })
    .whereNull('expires_at')
    .update({ expires_at: createdAt });
}
