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
    .then((res) => {
      if (res.status == 200 || res.status == 404) {
        return res.json()
      } else {
        throw new Error("Call storage api failed")
      }
    })
    .then((item) => {
        const bagId = item.bag_id
        if (bagId === undefined) {
            return null;
        }
        return item as BagDetail;
    });
}

export async function addTonBag({
  bag_id,
  path = configs.ton.downloadPath,
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
  }).then((res: Response) => {
      if (res.status == 200) {
          return res.json()
      } else {
          throw new Error(`Call storage api failed: ${res.status}`)
      }
  });
}


export async function downloadChildTonBag(bag_id: string) {
  const bd = await getTonBagDetails(bag_id);
  if (bd.header_loaded) {
    await addTonBag({ bag_id, files: bd.files.map((f) => f.index), donwload_all: true });
  }
}

export async function downloadTonBagSuccess(bag_id: string): Promise<boolean> {
    const bd = await getTonBagDetails(bag_id);
    if (bd) {
      return bd.downloaded == bd.size;
    }
    return false;
}

export async function downloadHeaderSuccess(bag_id: string): Promise<boolean> {
    const bd = await getTonBagDetails(bag_id);
    if (bd) {
      return bd.header_loaded;
    }
    return false;
}
