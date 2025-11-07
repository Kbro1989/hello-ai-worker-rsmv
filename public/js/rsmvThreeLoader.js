import * as THREE from './three.module.js';

export function createThreeMeshFromRsmvModel(modelJson) {
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(modelJson.vertices, 3));
  geometry.setIndex(modelJson.faces);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: modelJson.material.color,
    metalness: modelJson.material.metalness,
    roughness: modelJson.material.roughness,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData = modelJson.metadata;

  return mesh;
}