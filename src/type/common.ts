export type ENV = "dev" | "prod"

export enum Valid {
    TRUE = 1,
    FALSE = 0
}

export enum OrderState {
    invalid = -1,
    not_started = 0,
    started = 1,
}

export enum TaskState {
    unregister_storage_provider = 0,
    download_torrent_start = 1,
    download_torrent_header_success = 2,
    download_torrent_child_file_start = 3,
    download_torrent_success = 4,
    submit_storage_proof = 5,
    proof_success_wait_for_update_state = 6,
    period_finish = 6,
    task_finish = 7
}
