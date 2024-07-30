import {Task} from "../dao/task";
import {TaskState} from "../type/common";
import {sleep} from "../util/common";
import {Order} from "../dao/order";
import {
    addTonBag,
    downloadChildTonBag,
    downloadHeaderSuccess,
    downloadTonBagSuccess,
    getTonBagDetails
} from "../merkle/tonsutils";
import {logger} from "../util/logger";
import {Op} from "sequelize";

export async function downloadTorrentHeaders() {
    while(true) {
        const tasks = await Task.model.findAll({
            where: {
                task_state: TaskState.unregister_storage_provider
            },
            limit: 10
        });
        if (tasks.length === 0) {
            await sleep(10);
            continue;
        }
        for (const task of tasks) {
            const order = (await Order.model.findAll({
                where: {
                    id: task.order_id
                }
            }))[0];
            const torrentHash = order.torrent_hash;

            try {
                const result = await checkDownloadState(torrentHash, task);
                if (result) {
                    continue;
                }
                await addTonBag(torrentHash);
            } catch (e) {
                logger.error(`Failed to download meta bag ${torrentHash}: ${e}`);
                continue;
            }
            await Task.model.update({
                task_state: TaskState.download_torrent_start
            }, {
                where: {
                    id: task.id
                }
            });
        }
    }
}

async function checkDownloadState(torrentHash: string, task: any){
    const bagDetail = await getTonBagDetails(torrentHash);
    if (bagDetail.downloaded === bagDetail.size) {
        await Task.model.update({
            task_state: TaskState.download_torrent_success
        }, {
            where: {
                id: task.id
            }
        });
        return true;
    }
    if (bagDetail.header_loaded === true) {
        await Task.model.update({
            task_state: TaskState.download_torrent_header_success
        }, {
            where: {
                id: task.id
            }
        });
        return true;
    }
}

export async function downloadChildFiles() {
    while (true) {
        const tasks = await Task.model.findAll({
            where: {
                task_state: TaskState.download_torrent_header_success
            },
            limit: 10
        });
        if (tasks.length === 0) {
            await sleep(10);
            continue;
        }
        for (const task of tasks) {
            const order = (await Order.model.findAll({
                where: {
                    id: task.order_id
                }
            }))[0];
            const torrentHash = order.torrent_hash;
            try {
                const result = await checkDownloadState(torrentHash, task);
                if (result) {
                    continue;
                }
                await downloadChildTonBag(torrentHash);
            } catch (e) {
                logger.error(`Failed to download child bag ${torrentHash}: ${e}`);
                continue;
            }
            await Task.model.update({
                task_state: TaskState.download_torrent_child_file_start
            }, {
                where: {
                    id: task.id
                }
            });
        }
    }
}

export async function updateFileState() {
    while(true) {
        const tasks = await Task.model.findAll({
            where: {
                task_state: {
                    [Op.in]: [
                        TaskState.download_torrent_start,
                        TaskState.download_torrent_child_file_start
                    ]
                }
            },
            limit: 10
        });
        if (tasks.length === 0) {
            await sleep(5);
            continue;
        }
        for (const task of tasks) {
            const order = (await Order.model.findAll({
                where: {
                    id: task.order_id
                }
            }))[0];
            const torrentHash = order.torrent_hash;
            if (task.task_state === TaskState.download_torrent_start && await downloadHeaderSuccess(torrentHash)) {
                await Task.model.update({
                    task_state: TaskState.download_torrent_header_success
                }, {
                    where: {
                        id: task.id
                    }
                });
            }
            if (task.task_state === TaskState.download_torrent_child_file_start && await downloadTonBagSuccess(torrentHash)) {
                await Task.model.update({
                    task_state: TaskState.download_torrent_success
                }, {
                    where: {
                        id: task.id
                    }
                });
            }
        }
        await sleep(2);
    }
}
