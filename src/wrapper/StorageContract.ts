import {
    beginCell, Builder,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    DictionaryKey, DictionaryValue,
    Sender,
    SendMode, Slice,
    toNano
} from "@ton/core";
import {Address} from "@ton/ton";
import {
    op_recycle_undistributed_storage_fees, op_unregister_as_storage_provider, op_submit_storage_proof,
    op_register_as_storage_provider, op_claim_storage_rewards, ONE_TON, ONE_DAY, ONE_GIGA
} from './constants';
import {proofsIntoBody} from "./proofsutils";
import {logger} from "../util/logger";
import {OrderState} from "../type/common";
import {now} from "../util/common";
import BigNumber from "bignumber.js";

export type StorageContractConfig = {};

export function storageContractConfigToCell(config: StorageContractConfig): Cell {
    return beginCell().endCell();
}

const number256DictionaryKey: DictionaryKey<bigint> = {
    bits: 256,

    serialize(src: bigint): bigint {
        return BigInt(src);
    },

    parse(src: bigint): bigint {
        return src
    }
};

const cellDictionaryValue: DictionaryValue<Cell> = {

    serialize(src: Cell, builder: Builder) {
    },

    parse(src: Slice): Cell {
        return src.loadRef();
    }
};

export class StorageContract implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new StorageContract(address);
    }

    static createFromConfig(config: StorageContractConfig, code: Cell, workchain = 0) {
        const data = storageContractConfigToCell(config);
        const init = { code, data };
        return new StorageContract(contractAddress(workchain, init), init);
    }

    async getBalance(provider: ContractProvider) {
        const { balance } = await provider.getState();
        return balance;
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async getOrderInfo(provider: ContractProvider) {
        const result = await provider.get('get_order_info', []);
        const torrentHash = result.stack.readBigNumber();
        const ownerAddress = result.stack.readAddress();
        const fileMerkleHash = result.stack.readBigNumber();
        const fileSizeInBytes = result.stack.readBigNumber();
        const chunkSize = result.stack.readBigNumber();
        const storagePeriodInSec = result.stack.readBigNumber();
        const maxStorageProofSpanInSec = result.stack.readBigNumber();
        const treasuryAddress = result.stack.readAddress();
        const treasuryFeeRate = result.stack.readBigNumber();
        const maxStorageProvidersPerOrder = result.stack.readBigNumber();
        const storageProviderWhitelistDict = result.stack.readCell();

        return [
            torrentHash, ownerAddress, fileMerkleHash, fileSizeInBytes, storagePeriodInSec,
            maxStorageProofSpanInSec, treasuryAddress, treasuryFeeRate, chunkSize,
            maxStorageProvidersPerOrder, storageProviderWhitelistDict
        ];
    }

    async getStarted(provider: ContractProvider) {
        const result = await provider.get('started', []);
        return result.stack.readBoolean();
    }

    async getPeriodFinish(provider: ContractProvider) {
        const result = await provider.get('get_period_finish', []);
        return result.stack.readBigNumber();
    }

    async getTotalStorageProviders(provider: ContractProvider) {
        const result = await provider.get('get_total_storage_providers', []);
        return result.stack.readBigNumber();
    }

    async getUndistributedRewards(provider: ContractProvider) {
        const result = await provider.get('get_undistributed_rewards', []);
        return result.stack.readBigNumber();
    }

    async getEarned(provider: ContractProvider, providerAddress: Address) {
        const result = await provider.get('earned', [
            { type: 'slice', cell: beginCell().storeAddress(providerAddress).endCell() },
        ]);
        return result.stack.readBigNumber();
    }

    async getLastProofValid(provider: ContractProvider, providerAddress: Address) {
        const result = await provider.get('get_last_proof_valid', [
            { type: 'slice', cell: beginCell().storeAddress(providerAddress).endCell() },
        ]);
        return result.stack.readBoolean();
    }

    async getNextProof(provider: ContractProvider, providerAddress: Address) {
        const result = await provider.get('get_next_proof', [
            { type: 'slice', cell: beginCell().storeAddress(providerAddress).endCell() },
        ]);
        return result.stack.readBigNumber();
    }

    async getIsStorageProviderWhitelisted(provider: ContractProvider, providerAddress: Address) {
        const result = await provider.get('get_is_storage_provider_white_listed', [
            { type: 'slice', cell: beginCell().storeAddress(providerAddress).endCell() },
        ]);
        return result.stack.readBigNumber();
    }

    async sendRecycleUndistributedStorageFees(
        provider: ContractProvider, via: Sender
    ) {
        const messsage = beginCell()
            .storeUint(op_recycle_undistributed_storage_fees, 32) // op
            .storeUint(0, 64) // queryId
            .endCell();

        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: messsage,
            value: toNano('0.1'),
        });
    }

    async sendRegisterAsStorageProvider(
        provider: ContractProvider, via: Sender
    ) {
        const messsage = beginCell()
            .storeUint(op_register_as_storage_provider, 32) // op
            .storeUint(0, 64) // queryId
            .endCell();

        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: messsage,
            value: toNano('0.1'),
        });
    }

    async sendUnregisterAsStorageProvider(
        provider: ContractProvider, via: Sender
    ) {
        const messsage = beginCell()
            .storeUint(op_unregister_as_storage_provider, 32) // op
            .storeUint(0, 64) // queryId
            .endCell();

        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: messsage,
            value: toNano('0.1'),
        });
    }

    async sendSubmitStorageProof(
        provider: ContractProvider, via: Sender, proofs: bigint[]
    ) {
        const messsage = beginCell()
            .storeUint(op_submit_storage_proof, 32) // op
            .storeUint(0, 64) // queryId
        ;
        proofsIntoBody(messsage, proofs);
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: messsage.endCell(),
            value: toNano('0.01'),
        });
    }

    async sendClaimStorageRewards(
        provider: ContractProvider, via: Sender
    ) {
        const messsage = beginCell()
            .storeUint(op_claim_storage_rewards, 32) // op
            .storeUint(0, 64) // queryId
            .endCell();

        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: messsage,
            value: toNano('0.1'),
        });
    }

    async getStorageProviderLastProofTime(provider: ContractProvider, providerAddress: Address): Promise<number | null> {
        const state = await provider.getState();
        if (state.state.type === "active") {
            const cell = Cell.fromBoc(state.state.data!);
            const firstCell = cell[0];
            const ds = firstCell.beginParse();
            const orderInfo = ds.loadRef();
            const rewardsParams = ds.loadRef();
            const storageProvidersInfo = ds.loadRef();
            const storageProvidersInfoDs = storageProvidersInfo.beginParse();
            const storageProviders = storageProvidersInfoDs.loadDict<bigint, Cell>(number256DictionaryKey, cellDictionaryValue);
            const storageProviderLastProofTimes = storageProvidersInfoDs.loadDict<bigint, Cell>(number256DictionaryKey, cellDictionaryValue);
            const storageProviderLastProofValid = storageProvidersInfoDs.loadDict<bigint, Cell>(number256DictionaryKey, cellDictionaryValue);
            const storageProviderNextProofs = storageProvidersInfoDs.loadDict<bigint, Cell>(number256DictionaryKey, cellDictionaryValue);
            const providerAddressBigInt = this.parseStdAddr(providerAddress);
            if (storageProviderLastProofTimes.has(providerAddressBigInt)) {
                return storageProviderLastProofTimes.get(providerAddressBigInt).beginParse().loadUint(32);
            }
        }
        return null;
    }

    async getResidueProviderCount(provider: ContractProvider): Promise<number> {
        const state = await provider.getState();
        if (state.state.type === "active") {
            const cell = Cell.fromBoc(state.state.data!);
            const firstCell = cell[0];
            const ds = firstCell.beginParse();
            const orderInfo = ds.loadRef();
            const rewardsParams = ds.loadRef();
            const storageProvidersInfo = ds.loadRef();
            const storageProvidersInfoDs = storageProvidersInfo.beginParse();
            const storageProviders = storageProvidersInfoDs.loadDict<bigint, Cell>(number256DictionaryKey, cellDictionaryValue);
            const {max_storage_provider_count} = this.loadOrderInfo(firstCell);
            return max_storage_provider_count - storageProviders.size;
        }
        return 0;
    }

    async getInStorageProviderList(provider: ContractProvider, providerAddress: Address): Promise<boolean> {
        const state = await provider.getState();
        if (state.state.type === "active") {
            const cell = Cell.fromBoc(state.state.data!);
            const firstCell = cell[0];
            const ds = firstCell.beginParse();
            const orderInfo = ds.loadRef();
            const rewardsParams = ds.loadRef();
            const storageProvidersInfo = ds.loadRef();
            const storageProvidersInfoDs = storageProvidersInfo.beginParse();
            const storageProviders = storageProvidersInfoDs.loadDict<bigint, Cell>(number256DictionaryKey, cellDictionaryValue);
            const providerAddressBigInt = this.parseStdAddr(providerAddress);
            return storageProviders.has(providerAddressBigInt);
        }
        return false;
    }

    async getOrderState(provider: ContractProvider): Promise<any|null> {
        const orderState = await provider.getState();
        if (orderState.state.type !== "active") {
            logger.error(`Order contract is not active: ${orderState.state.type}`);
            return null;
        }
        const cells = Cell.fromBoc(orderState.state.data!);
        const cell = cells[0];
        const orderInfo = this.loadOrderInfo(cell);
        const rewardsParams = this.loadRewardsParams(cell);
        const orderPrice = this.loadOrderPrice(orderInfo.file_size_in_bytes, orderInfo.storage_period_in_sec, rewardsParams.total_rewards);
        return {
            address: this.address.toString(),
            ...orderInfo,
            started: rewardsParams.started,
            total_rewards: rewardsParams.total_rewards,
            period_finish: rewardsParams.period_finish,
            order_detail: JSON.stringify(rewardsParams),
            order_price: orderPrice,
            order_state: this.parseOrderState(rewardsParams.started, rewardsParams.period_finish)
        };
    }

    parseOrderState(started: number, period_finish: number): OrderState {
        if (started === 0) {
            return OrderState.not_started;
        }
        return period_finish > now() ? OrderState.started : OrderState.invalid;
    }

    /**
     * Load order info from contract base cell
     * @param cell
     */
    loadOrderInfo(cell: Cell): {
        torrent_hash: string;
        owner_address: string;
        file_merkle_hash: string;
        file_size_in_bytes: number;
        storage_period_in_sec: number;
        max_storage_proof_span_in_sec: number;
        max_storage_provider_count: number;
        treasury_info: string
    } {
        const cs = cell.beginParse();
        const orderInfo = cs.loadRef();
        const orderDs = orderInfo.beginParse();
        const torrent_hash_bit = orderDs.loadUintBig(256);
        const torrent_hash = torrent_hash_bit.toString(16);
        const owner_address = orderDs.loadAddress().toString();
        const file_merkle_hash_bit = orderDs.loadUintBig(256);
        const file_merkle_hash = file_merkle_hash_bit.toString(16);
        const file_size_in_bytes = orderDs.loadUint(64);
        const chunk_size = orderDs.loadUint(32);
        const storage_period_in_sec = orderDs.loadUint(64);
        const max_storage_proof_span_in_sec = orderDs.loadUint(64);
        const max_storage_provider_count = orderDs.loadUint(16);
        const treasuryCell = orderDs.loadRef();
        const ds = treasuryCell.beginParse();
        const treasury_info = {
            treasury_address: ds.loadAddress().toString(),
            treasury_fee_rate: ds.loadUint(16)
        }
        return {
            torrent_hash,
            owner_address,
            file_merkle_hash,
            file_size_in_bytes,
            storage_period_in_sec,
            max_storage_proof_span_in_sec,
            max_storage_provider_count,
            treasury_info: JSON.stringify(treasury_info)
        }
    }

    loadOrderPrice(file_size_in_bytes: number, storage_period_in_sec: number, total_rewards: number): string {
        const tonReward = new BigNumber(total_rewards).dividedBy(ONE_TON);
        const periodInDay = new BigNumber(storage_period_in_sec).dividedBy(ONE_DAY);
        const fileSizeInGb = new BigNumber(file_size_in_bytes).dividedBy(ONE_GIGA);
        return tonReward.dividedBy(periodInDay).dividedBy(fileSizeInGb).toFixed(5, 1)
    }

    loadRewardsParams(cell: Cell): {
        started: number;
        total_storage_providers: number;
        total_rewards: number;
        total_rewards_per_sec_scaled: number;
        undistributed_rewards_scaled: number;
        per_sec_per_provider_total_rewards_settled_scaled: number;
        period_finish: number;
        last_settle_time: number
    } {
        const cs = cell.beginParse();
        const orderInfo = cs.loadRef();
        const rewardsParams = cs.loadRef();
        const storageProvidersInfo = cs.loadRef();
        const ds = rewardsParams.beginParse();
        const providersInfoDs = storageProvidersInfo.beginParse();
        return {
            started: ds.loadUint(1),
            total_storage_providers: ds.loadUint(32),
            total_rewards: ds.loadUint(192),
            total_rewards_per_sec_scaled: ds.loadUint(192),
            undistributed_rewards_scaled: ds.loadUint(192),
            per_sec_per_provider_total_rewards_settled_scaled: ds.loadUint(192),
            period_finish: ds.loadUint(32),
            last_settle_time: ds.loadUint(32)
        }
    }

    parseStdAddr(address: Address): bigint {
        return BigInt("0x" + address.hash.toString('hex'))
    }
}
