import { EmbeddedContract } from 'znn-typescript-sdk';

/** Address of the PTLC embedded contract (go-zenon types.PtlcContract). */
export const PTLC_ADDRESS = 'z1qxemdeddedxptlcxxxxxxxxxxxxxxxxx6lqady';

/** ABI of the PTLC embedded contract, which the SDK does not ship. */
export class PtlcContract extends EmbeddedContract {
  protected static readonly definition: string = `
	[
		{"type":"function","name":"Create", "inputs":[
			{"name":"expirationTime","type":"int64"},
			{"name":"pointType","type":"uint8"},
			{"name":"pointLock","type":"bytes"},
			{"name":"destination","type":"address"}
		]},
		{"type":"function","name":"Reclaim","inputs":[
			{"name":"id","type":"hash"}
		]},
		{"type":"function","name":"Unlock","inputs":[
			{"name":"id","type":"hash"},
			{"name":"signature","type":"bytes"}
		]},
		{"type":"function","name":"ProxyUnlock","inputs":[
			{"name":"id","type":"hash"},
			{"name":"destination","type":"address"},
			{"name":"signature","type":"bytes"}
		]},
		{"type":"function","name":"CreateWithReclaimLock", "inputs":[
			{"name":"expirationTime","type":"int64"},
			{"name":"pointType","type":"uint8"},
			{"name":"pointLock","type":"bytes"},
			{"name":"destination","type":"address"},
			{"name":"reclaimPointType","type":"uint8"},
			{"name":"reclaimPointLock","type":"bytes"}
		]},
		{"type":"function","name":"ReclaimWithSignature","inputs":[
			{"name":"id","type":"hash"},
			{"name":"signature","type":"bytes"}
		]},
		{"type":"variable","name":"ptlcInfo","inputs":[
			{"name":"timeLocked","type":"address"},
			{"name":"tokenStandard","type":"tokenStandard"},
			{"name":"amount","type":"uint256"},
			{"name":"expirationTime", "type":"int64"},
			{"name":"pointType","type":"uint8"},
			{"name":"pointLock","type":"bytes"},
			{"name":"destination","type":"address"}
		]},
		{"type":"variable","name":"ptlcReclaimLock","inputs":[
			{"name":"pointType","type":"uint8"},
			{"name":"pointLock","type":"bytes"}
		]}
	]`;
}
