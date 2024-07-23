import {sequelize} from "../db";
import {DataTypes, Transaction} from "sequelize";
import {ModelStatic, UpdateOptions} from "sequelize/types/model";
export class Config {
    static model: ModelStatic<any>  = sequelize.define(
        'configs', {
            id: {
                type: DataTypes.BIGINT,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false
            },
            config_key: {
                type: DataTypes.STRING,
                unique: true,
                allowNull: false,
            },
            config_value: {
                type: DataTypes.STRING,
                allowNull: false
            }
        }
    );

    static async updateConfig(key:string, value: string, transaction?: Transaction) {
        let condition: UpdateOptions = {
            where: {
                config_key: key
            }
        }
        if (transaction) {
            condition = {
                ...condition,
                transaction
            }
        }
        return await this.model.update({
            config_value: value
        }, condition);
    }

    static async queryConfig(key: string): Promise<string|null> {
        const result = await this.model.findAll({
            where: {
                config_key: key
            }
        });
        if (result.length > 0) {
            return result[0].config_key
        }
        return null;
    }

    static async get(key: string, defaultValue: string): Promise<string> {
        const result = await this.queryConfig(key);
        return result || defaultValue;
    }

    static async getBool(key: string): Promise<boolean> {
        const result = await this.queryConfig(key);
        return result === "true";
    }

    static async getInt(key: string, defaultValue: number): Promise<number> {
        const result = await this.queryConfig(key);
        return result ? parseInt(result) : defaultValue;
    }
}
