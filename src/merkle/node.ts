import { createReadStream } from "fs";
import path from "path";
import { isMainThread, parentPort, Worker, workerData } from "worker_threads";
import { MerkleTree } from "./merkle";
import { getTonBagDetails } from "./tonsutils";

type WD =
  | {
      type: "getProofs";
      bag_id: string;
      random: number;
    }
  | {
      type: "getMerkleRoot";
      bag_id: string;
    };

if (isMainThread) {
  let works: Worker[] = [];
  const maxWorks = 5;
  const reqGenWork = async (workerData: WD, reject: (e: any) => void) => {
    while (true) {
      if (works.length < maxWorks) {
        const worker = new Worker(__filename, { workerData });
        works = works.concat(worker);
        worker.on("error", (error) => {
          reject(error);
        });
        worker.on("exit", (code) => {
          works = works.filter((w) => w !== worker);
          if (code !== 0) {
            reject(new Error(`work stopred with code ${code}`));
          }
        });
        return worker;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  };

  module.exports = {
    getProofs(bag_id: string, random: number) {
      return new Promise<bigint[]>((resolve, reject) => {
        reqGenWork({ type: "getProofs", bag_id: bag_id, random }, reject).then((w) => {
          w.on("message", resolve);
        });
      });
    },

    getMerkleRoot(bag_id: string) {
      return new Promise<bigint[]>((resolve, reject) => {
        reqGenWork({ type: "getMerkleRoot", bag_id: bag_id }, reject).then((w) => {
          w.on("message", resolve);
        });
      });
    },
  };
} else {
  const main = async function () {
    const wd = workerData as WD;
    const bd = await getTonBagDetails(wd.bag_id);
    if (bd.downloaded !== bd.size) {
      throw "Bag not downloaded";
    }
    if (![].includes(wd.type)) {
      throw "Type error";
    }
    const files = bd.files as { index: number; name: string; size: number }[];
    const chunks: Buffer[] = [];
    for (const ifile of files) {
      const ipath = path.resolve(bd.path, bd.dir_name, ifile.name);
      // const fstat = await promises.stat(ipath)
      const rs = createReadStream(ipath);
      await new Promise((resolve) => {
        rs.on("data", (buf: Buffer) => {
          chunks.push(buf);
        });
        rs.on("end", resolve);
        rs.read();
      });
    }
    const fc = new Blob(chunks);
    const mt = new MerkleTree();
    await mt.genTree(fc);
    if (wd.type == "getProofs") {
      const dap = await mt.getDataAndProofs(fc, Math.floor(wd.random / fc.size));
      parentPort.postMessage(dap);
    } else if (wd.type == "getMerkleRoot") {
      parentPort.postMessage(mt.tree[0]);
    }
  };
  main();
}
