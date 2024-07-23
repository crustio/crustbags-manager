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
    submit_storage_proof = 1,
    period_finish = 2,
    task_finish = 3
}
