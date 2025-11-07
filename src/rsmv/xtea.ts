const ROUNDS = 32;
const DELTA = 0x9E3779B9;

export function simplexteadecrypt(data: Uint8Array, key: Uint32Array) {
    let res = new Uint8Array(data.length);
    let dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let resView = new DataView(res.buffer);
    let index = 0;
    for (; index <= data.length - 8; index += 8) {
        let v0 = dataView.getUint32(index + 0, false);
        let v1 = dataView.getUint32(index + 4, false);
        var sum = (DELTA * ROUNDS) >>> 0;

        while (sum) {
            v1 -= (((v0 << 4) >>> 0 ^ (v0 >>> 5)) + v0) ^ (sum + key[(sum >> 11) & 3]);
            v1 = v1 >>> 0;
            sum = (sum - DELTA) >>> 0;
            v0 -= (((v1 << 4) >>> 0 ^ (v1 >>> 5)) + v1) ^ (sum + key[sum & 3]);
            v0 = v0 >>> 0;
        }
        resView.setUint32(index + 0, v0, false);
        resView.setUint32(index + 4, v1, false);
    }
    //any non-aligned footer bytes aren't encrypted
    res.set(data.subarray(index), index);
    return res;
}
