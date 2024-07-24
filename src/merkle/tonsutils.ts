import { configs, env } from "../config";

export type FilesItem = {
  index: number;
  name: string;
  size: number;
};

export type PeersItem = {
  addr: string;
  id: string;
  upload_speed: number;
  download_speed: number;
};

export type BagDetail = {
  bag_id: string;
  description: string;
  downloaded: number;
  size: number;
  download_speed: number;
  upload_speed: number;
  files_count: number;
  dir_name: string;
  completed: boolean;
  header_loaded: boolean;
  info_loaded: boolean;
  active: boolean;
  seeding: boolean;
  piece_size: number;
  bag_size: number;
  merkle_hash: string;
  path: string;
  files: FilesItem[];
  peers: PeersItem[];
};

export function sleep(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}
const baseUrl = configs.tonStorageUtilsApi
export async function getTonBagDetails(bag_id: string) {
  return fetch(`${baseUrl}/api/v1/details?bag_id=${bag_id}`)
    .then((res) => res.json())
    .then((item) => item as BagDetail);
}

export async function addTonBag({
  bag_id,
  path = "/root/downloads",
  files = [],
  donwload_all = false,
}: {
  bag_id: string;
  path?: string;
  files?: number[];
  donwload_all?: boolean;
}) {
  return fetch(`${baseUrl}/api/v1/add`, {
    method: "POST",
    body: JSON.stringify({
      bag_id,
      path,
      files,
      donwload_all,
    }),
  });
}

export async function downTonBag(bag_id: string, waitCompleted: boolean = false) {
  await addTonBag({ bag_id });
  let bd: BagDetail;
  // check header
  while (true) {
    await sleep(1000);
    bd = await getTonBagDetails(bag_id);
    if (bd.header_loaded) {
      break;
    }
  }
  // down all
  await addTonBag({ bag_id, files: bd.files.map((f) => f.index), donwload_all: true });
  // check all
  while (waitCompleted) {
    await sleep(2000);
    bd = await getTonBagDetails(bag_id);
    if (bd.downloaded == bd.size) {
      return true;
    }
  }
  return true
}
