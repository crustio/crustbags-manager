import {logger} from "../util/logger";
import {indexPlaceOrderTransactions} from "./transaction";
import {analysisOrders, updateOrderState} from "./order";
import {generateTasks} from "./task";
import {downloadChildFiles, downloadTorrentHeaders, updateFileState} from "./storage";
import {claimRewards, registerStorageProvider, updateStorageProviderState, uploadStorageProofs} from "./tonbag";

export async function job() {
    const queryTx = indexPlaceOrderTransactions();
    const analysisTx = analysisOrders();
    const updateOrder = updateOrderState();
    const generate = generateTasks();
    const downloadHeaders = downloadTorrentHeaders();
    const downloadChild = downloadChildFiles();
    const fileState = updateFileState();
    const register = registerStorageProvider();
    const uploadProof = uploadStorageProofs();
    const updateProofState = updateStorageProviderState();
    const claim = claimRewards();
    const jobs = [queryTx, analysisTx,
        updateOrder, generate, downloadHeaders, downloadChild,
        fileState, register, uploadProof, updateProofState, claim];
    return Promise.all(jobs).catch(e => {
        logger.error(`Error in jobs: ${e.stack}`);
        throw new Error(e);
    });
}
