/**
 * hello-ai Cloudflare Worker
 *
 * This worker serves the frontend assets and handles requests for RuneScape model data,
 * integrating AI capabilities and KV storage.
 */
import { Env } from "./types";
import { FileParser } from "./rsmv/opdecoder";
import { CacheFileSource } from "./rsmv/cache";
import { getParsers } from "./rsmv/opdecoder";
import { HSL2RGB, packedHSL2HSL } from "./rsmv/utils";
import * as THREE from 'three'; // Needed for BufferAttribute, etc.

// Placeholder for AI functionality - to be implemented
// const MODEL_ID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// Placeholder for ModelData and ModelMeshData types if not imported elsewhere
type ModelData = {
    maxy: number,
    miny: number,
    skincount: number,
    bonecount: number,
    meshes: ModelMeshData[],
    debugmeshes?: THREE.Mesh[]
}

type ModelMeshData = {
    indices: THREE.BufferAttribute,
    vertexstart: number,
    vertexend: number,
    indexLODs: THREE.BufferAttribute[],
    materialId: number,
    hasVertexAlpha: boolean,
    needsNormalBlending: boolean,
    attributes: {
        pos: THREE.BufferAttribute,
        normals?: THREE.BufferAttribute,
        color?: THREE.BufferAttribute,
        texuvs?: THREE.BufferAttribute,
        skinids?: THREE.BufferAttribute,
        skinweights?: THREE.BufferAttribute,
        boneids?: THREE.BufferAttribute,
        boneweights?: THREE.BufferAttribute
    }
}

function parsePosData(arr: Int16Array): THREE.BufferAttribute {
    return new THREE.BufferAttribute(new Float32Array(arr), 3);
}

function addBoneIdBuffer(attributes: ModelMeshData["attributes"], boneidBuffer: Uint16Array) {
    let quadboneids = new Uint8Array(boneidBuffer.length * 4);
    let quadboneweights = new Uint8Array(boneidBuffer.length * 4);
    const maxshort = (1 << 16) - 1;
    for (let i = 0; i < boneidBuffer.length; i++) {
        let id = boneidBuffer[i]
        id = (id == maxshort ? 0 : id + 1);
        quadboneids[i * 4] = id;
        quadboneweights[i * 4] = 255;
    }
    attributes.boneids = new THREE.BufferAttribute(quadboneids, 4);
    attributes.boneweights = new THREE.BufferAttribute(quadboneweights, 4, true);
}

function addUvBuffer(attributes: ModelMeshData["attributes"], vertexCount: number, uvBuffer: Uint16Array | Float32Array) {
    if (uvBuffer instanceof Uint16Array) {
        let uvBufferCopy = new Float32Array(vertexCount * 2);
        for (let i = 0; i < vertexCount * 2; i++) {
            // Assuming ushortToHalf is available or implemented elsewhere
            // For now, a direct copy or placeholder
            uvBufferCopy[i] = uvBuffer[i]; // Placeholder, actual conversion needed
        }
        attributes.texuvs = new THREE.BufferAttribute(uvBufferCopy, 2);
    } else {
        attributes.texuvs = new THREE.BufferAttribute(uvBuffer, 2);
    }
}

function addNormalsBuffer(attributes: ModelMeshData["attributes"], normalBuffer: Int8Array | Int16Array) {
    let normalsrepacked = new Int8Array(normalBuffer.length);
    for (let i = 0; i < normalBuffer.length; i += 3) {
        let x = normalBuffer[i + 0];
        let y = normalBuffer[i + 1];
        let z = normalBuffer[i + 2];
        let len = Math.hypot(x, y, z);
        if (len == 0) {
            len = 1;
        }
        let scale = 127 / len;
        normalsrepacked[i + 0] = Math.round(x * scale);
        normalsrepacked[i + 1] = Math.round(y * scale);
        normalsrepacked[i + 2] = Math.round(z * scale);
    }
    attributes.normals = new THREE.BufferAttribute(normalsrepacked, 3, true);
}

export async function parseOb3Model(buffer: Uint8Array, source: CacheFileSource): Promise<ModelData> {
    const parsers = await getParsers(env); // Assuming env is accessible here or passed
    const modelFileParser = parsers.models as FileParser<any>; // Cast to any for now
    const parsed = await modelFileParser.read(buffer, source);

    let meshes: ModelMeshData[] = [];

    if (parsed.meshes) {
        for (let mesh of parsed.meshes) {
            if (mesh.isHidden) { continue; }
            let indexBuffers = mesh.indexBuffers;
            let indexlods = indexBuffers.map((q: Uint16Array) => new THREE.BufferAttribute(q, 1));
            let indexbuf = indexBuffers[0];

            let attributes: ModelMeshData["attributes"] = {
                pos: parsePosData(mesh.positionBuffer!)
            }

            if (mesh.skin) {
                let skinIdBuffer = new Uint16Array(mesh.vertexCount * 4);
                let skinWeightBuffer = new Uint8Array(mesh.vertexCount * 4);
                let weightin = mesh.skin.skinWeightBuffer;
                let idin = mesh.skin.skinBoneBuffer;
                let idindex = 0;
                let weightindex = 0;
                for (let i = 0; i < mesh.vertexCount; i++) {
                    let remainder = 255;
                    for (let j = 0; j < 4; j++) {
                        let weight = weightin[weightindex++];
                        let boneid = idin[idindex++];
                        let actualweight = (weight != 0 ? weight : remainder);
                        remainder -= weight;
                        skinIdBuffer[i * 4 + j] = (boneid == 65535 ? 0 : boneid);
                        skinWeightBuffer[i * 4 + j] = actualweight;
                        if (weight == 0) { break; }
                    }
                }
                if (idindex != mesh.skin.skinWeightCount || weightindex != mesh.skin.skinWeightCount) {
                    console.log("model skin decode failed");
                }
                attributes.skinids = new THREE.BufferAttribute(skinIdBuffer, 4);
                attributes.skinweights = new THREE.BufferAttribute(skinWeightBuffer, 4, true);
            }

            if (mesh.colourBuffer) {
                if (!indexbuf) { throw new Error("need index buf in order to read per-face colors"); }
                let vertexcolor = new Uint8Array(mesh.vertexCount * 4);
                let alphaBuffer = mesh.alphaBuffer;
                for (let i = 0; i < mesh.faceCount; i++) {
                    let [r, g, b] = HSL2RGB(packedHSL2HSL(mesh.colourBuffer[i]));
                    for (let j = 0; j < 3; j++) {
                        let index = indexbuf[i * 3 + j] * 4;
                        vertexcolor[index + 0] = r;
                        vertexcolor[index + 1] = g;
                        vertexcolor[index + 2] = b;
                        if (alphaBuffer) {
                            vertexcolor[index + 3] = alphaBuffer[i];
                        } else {
                            vertexcolor[index + 3] = 255;
                        }
                    }
                }
                attributes.color = new THREE.BufferAttribute(vertexcolor, 4, true);
            }

            if (mesh.boneidBuffer) { addBoneIdBuffer(attributes, mesh.boneidBuffer); }
            if (mesh.uvBuffer) { addUvBuffer(attributes, mesh.vertexCount, mesh.uvBuffer); }
            if (mesh.normalBuffer) { addNormalsBuffer(attributes, mesh.normalBuffer); }

            meshes.push({
                indices: indexlods[0],
                vertexstart: 0,
                vertexend: attributes.pos.count,
                indexLODs: indexlods,
                materialId: mesh.materialArgument - 1,
                hasVertexAlpha: !!mesh.alphaBuffer,
                needsNormalBlending: false,
                attributes: attributes
            });
        }
    } else if (parsed.meshdata) {
        let mesh = parsed.meshdata
        let attributes: ModelMeshData["attributes"] = {
            pos: parsePosData(mesh.positionBuffer!)
        }

        if (mesh.vertexColours) {
            let vertexcolor = new Uint8Array(mesh.vertexCount * 4);
            let alphaBuffer = mesh.vertexAlpha;
            for (let i = 0; i < mesh.vertexColours.length; i++) {
                let [r, g, b] = HSL2RGB(packedHSL2HSL(mesh.vertexColours[i]));
                let alpha = (alphaBuffer ? alphaBuffer[i] : 255);
                let index = i * 4;
                vertexcolor[index + 0] = r;
                vertexcolor[index + 1] = g;
                vertexcolor[index + 2] = b;
                vertexcolor[index + 3] = alpha;
            }
            attributes.color = new THREE.BufferAttribute(vertexcolor, 4, true);
        }

        if (mesh.skin) {
            let skinIdBuffer = new Uint16Array(mesh.vertexCount * 4);
            let skinWeightBuffer = new Uint8Array(mesh.vertexCount * 4);
            for (let i = 0; i < mesh.skin.length; i++) {
                let entry = mesh.skin[i];
                let remainder = 255;
                if (entry.ids.length != entry.weights.length) { throw new Error("unexpected length difference in skin weights/ids"); }
                for (let j = 0; j < entry.ids.length; j++) {
                    let weight = entry.weights[j];
                    let boneid = entry.ids[j];
                    let actualweight = (weight != 0 ? weight : remainder);
                    remainder -= weight;
                    skinIdBuffer[i * 4 + j] = (boneid == 65535 ? 0 : boneid);
                    skinWeightBuffer[i * 4 + j] = actualweight;
                    if (weight == 0) { break; }
                }
            }
            attributes.skinids = new THREE.BufferAttribute(skinIdBuffer, 4);
            attributes.skinweights = new THREE.BufferAttribute(skinWeightBuffer, 4, true);
        }
        if (mesh.boneidBuffer) { addBoneIdBuffer(attributes, mesh.boneidBuffer); }
        if (mesh.uvBuffer) { addUvBuffer(attributes, mesh.vertexCount, mesh.uvBuffer); }
        if (mesh.normalBuffer) { addNormalsBuffer(attributes, mesh.normalBuffer); }

        for (let render of mesh.renders) {
            if (render.isHidden) { continue; }
            if (render.buf.length == 0) { continue; }
            let buf = render.buf;
            if (buf.BYTES_PER_ELEMENT == 4) {
                let newbuf = new Uint32Array(buf.length);
                for (let i = 0; i < buf.length; i++) {
                    let v = buf[i];
                    newbuf[i] = ((v >> 24) & 0xff) | ((v >> 8) & 0xff00) | ((v << 8) & 0xff0000) | ((v << 24) & 0xff000000);
                }
                buf = newbuf;
            }
            let minindex = buf[0];
            let maxindex = buf[0];
            for (let i = 0; i < buf.length; i++) {
                let v = buf[i];
                if (v < minindex) { minindex = v; }
                if (v > maxindex) { maxindex = v; }
            }
            let index = new THREE.BufferAttribute(buf, 1);
            meshes.push({
                indices: index,
                vertexstart: minindex,
                vertexend: maxindex + 1,
                indexLODs: [index],
                materialId: render.materialArgument - 1,
                hasVertexAlpha: !!render.hasVertexAlpha,
                needsNormalBlending: false,
                attributes: attributes
            })
        }
    }

    return makeModelData(meshes);
}

export function makeModelData(meshes: ModelData["meshes"]) {
    let maxy = 0;
    let miny = 0;
    let bonecount = 0;
    let skincount = 0;
    for (let mesh of meshes) {
        let pos = mesh.attributes.pos;
        for (let i = 0; i < pos.count; i++) {
            let y = pos.getY(i);
            if (y > maxy) { maxy = y }
            if (y < miny) { miny = y }
        }
        let boneids = mesh.attributes.boneids;
        if (boneids) {
            for (let i = 0; i < boneids.count; i++) {
                bonecount = Math.max(bonecount, boneids.getX(i), boneids.getY(i), boneids.getZ(i), boneids.getW(i))
            }
            bonecount += 2;
        }
        let skinids = mesh.attributes.skinids;
        if (skinids) {
            for (let i = 0; i < skinids.count; i++) {
                skincount = Math.max(skincount, skinids.getX(i), skinids.getY(i), skinids.getZ(i), skinids.getW(i))
            }
            skincount += 2;
        }
    }
    let r: ModelData = { maxy, miny, meshes, bonecount: bonecount, skincount: skincount };
    return r;
}

export default {
	/**
	 * Main request handler for the Worker
	 */
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);

		// Handle static assets (frontend)
		if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
			return env.ASSETS.fetch(request);
		}

		// API Routes
		if (url.pathname.startsWith("/api/model/")) {
			// Handle model data requests
			return handleModelRequest(request, env);
		}

		// Handle 404 for unmatched routes
		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

/**
 * Handles model data API requests
 */
async function handleModelRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const url = new URL(request.url);
		// Extract modelId from path, e.g., /api/model/123 -> modelId = "123"
		const modelId = url.pathname.split("/").pop(); 

		if (!modelId) {
			return new Response("Model ID is required", { status: 400 });
		}

		// Fetch the model data from KV or assets
		// For now, assume model data is fetched from assets for simplicity
		// In a real scenario, this would fetch from KV or a specific model store
		// We need to construct a URL that ASSETS can fetch.
		// Assuming models are stored in the 'public/models/' directory.
		const assetPath = `/models/${modelId}.ob3`; 
		const modelAsset = await env.ASSETS.fetch(`https://example.com${assetPath}`); // Use a dummy host for ASSETS.fetch

		if (!modelAsset.ok) {
			return new Response(`Model ${modelId} not found`, { status: 404 });
		}

		const modelBuffer = await modelAsset.arrayBuffer();
		// Pass a dummy CacheFileSource object if it's not strictly needed by FileParser.read
		const modelData = await parseOb3Model(new Uint8Array(modelBuffer), { getDecodeArgs: () => ({}) } as CacheFileSource); 

		// Return model data as JSON (or appropriate format)
		return new Response(JSON.stringify(modelData), {
			headers: { "content-type": "application/json" },
		});

	} catch (error) {
		console.error("Error processing model request:", error);
		return new Response(
			JSON.stringify({ error: "Failed to process model request" }),
			{
				status: 500,
				headers: { "content-type": "application/json" },
			},
		);
	}
}
