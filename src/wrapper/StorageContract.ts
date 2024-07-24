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
    op_register_as_storage_provider, op_claim_storage_rewards
} from './constants';
import {proofsIntoBody} from "./proofsutils";

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
        const storagePeriodInSec = result.stack.readBigNumber();
        const maxStorageProofSpanInSec = result.stack.readBigNumber();
        const treasuryAddress = result.stack.readAddress();
        const treasuryFeeRate = result.stack.readBigNumber();

        return [
            torrentHash, ownerAddress, fileMerkleHash, fileSizeInBytes, storagePeriodInSec, maxStorageProofSpanInSec, treasuryAddress, treasuryFeeRate
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
            value: toNano('0.1'),
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

    parseStdAddr(address: Address): bigint {
        return BigInt("0x" + address.hash.toString('hex'))
    }
}
