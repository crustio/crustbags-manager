import {ModelStatic} from "sequelize/types/model";
import {sequelize} from "../db";
import {DataTypes} from "sequelize";
import {TaskState} from "../type/common";

export class Task {
    static model: ModelStatic<any> = sequelize.define(
        'tasks', {
            id: {
                type: DataTypes.BIGINT,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false,
            },
            order_id: {
                type: DataTypes.BIGINT,
                allowNull: false,
            },
            provider_address: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: ""
            },
            task_state: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: TaskState.unregister_storage_provider
            },
            last_proof_time: {
                type: DataTypes.BIGINT,
                allowNull: false,
                defaultValue: 0
            },
            next_proof_time: {
                type: DataTypes.BIGINT,
                allowNull: false,
                defaultValue: 0
            },
            next_proof: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0
            }
        }, {
            indexes: [
                {
                    fields: ['task_state']
                }
            ]
        }
    );
}
