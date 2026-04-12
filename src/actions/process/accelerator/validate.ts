import {
  ACCELERATOR_NAME_MAX_LENGTH,
  ACCELERATOR_DESCRIPTION_MAX_LENGTH,
  ACCELERATOR_ZNN_MAXIMUM_FUNDS,
  ACCELERATOR_QSR_MAXIMUM_FUNDS,
} from '../../../constants/zenon.js';

const URL_REGEX =
  /^([Hh][Tt][Tt][Pp][Ss]?:\/\/)?[a-zA-Z0-9]{2,60}\.[a-zA-Z]{1,6}([-a-zA-Z0-9()@:%_+.~#?&/=]{0,100})$/;

export function validateProjectParams(decoded: Record<string, any>): void {
  const name = decoded.name;
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('Accelerator: name is empty');
  }
  if (name.length > ACCELERATOR_NAME_MAX_LENGTH) {
    throw new Error(`Accelerator: name exceeds ${ACCELERATOR_NAME_MAX_LENGTH} characters`);
  }

  const description = decoded.description;
  if (typeof description !== 'string' || description.length === 0) {
    throw new Error('Accelerator: description is empty');
  }
  if (description.length > ACCELERATOR_DESCRIPTION_MAX_LENGTH) {
    throw new Error(
      `Accelerator: description exceeds ${ACCELERATOR_DESCRIPTION_MAX_LENGTH} characters`,
    );
  }

  const url = decoded.url;
  if (typeof url !== 'string' || !URL_REGEX.test(url)) {
    throw new Error('Accelerator: invalid URL');
  }

  if (decoded.znnFundsNeeded !== undefined && decoded.znnFundsNeeded !== null) {
    const znn = BigInt(decoded.znnFundsNeeded.toString());
    if (znn > ACCELERATOR_ZNN_MAXIMUM_FUNDS) {
      throw new Error('Accelerator: znnFundsNeeded exceeds maximum');
    }
  }

  if (decoded.qsrFundsNeeded !== undefined && decoded.qsrFundsNeeded !== null) {
    const qsr = BigInt(decoded.qsrFundsNeeded.toString());
    if (qsr > ACCELERATOR_QSR_MAXIMUM_FUNDS) {
      throw new Error('Accelerator: qsrFundsNeeded exceeds maximum');
    }
  }
}
