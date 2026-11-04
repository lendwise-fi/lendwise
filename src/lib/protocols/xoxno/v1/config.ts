import type { XoxnoDeployment } from './types'

export const XOXNO_PROTOCOL = 'xoxno_v1' as const
export const XOXNO_PROVIDER = 'xoxno' as const
export const XOXNO_CHAIN_ID = -1

/** rs-lending-xlm/configs/networks.json mainnet deployment. */
export const XOXNO_MAINNET: XoxnoDeployment = {
  network: 'mainnet',
  apiUrl: 'https://api.xoxno.com',
  controller: 'CAUCMIN5KSXEVZ7NMXR3LZATGD5EFIEUI5XWTFLYRO2R5OTXI22WE5JX',
  pool: 'CBXRNDQMAJFG4VUKMKFEMFS75UUXE2SPSNV4LEEFCSNBCN66PYRWBKXO',
  nft: 'CAWCSG77AY2W24QZ6ZXLHZU4UXEFHZBM6EI4A4IF7JB5CTY4XND3TI6C',
}
