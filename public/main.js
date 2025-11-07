import { OrbitControls } from './js/OrbitControls.js';
import { parseRSMV } from '../src/rsmvLoader.ts'; // Import the new parser

// 1. Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcccccc);

// Add GridHelper
const gridHelper = new THREE.GridHelper(10, 10);
scene.add(gridHelper);

// Add AxesHelper
const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);

// 2. Camera Setup
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

// 3. Renderer Setup
const viewerContainer = document.getElementById('viewer-container');
const canvas = document.querySelector('#renderer-canvas');
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
renderer.setSize(viewerContainer.clientWidth, viewerContainer.clientHeight);

// 4. Camera Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // an animation loop is required when damping is enabled
controls.dampingFactor = 0.25;
controls.screenSpacePanning = false;
controls.maxPolarAngle = Math.PI / 2;

let currentModel = null;

async function loadModel(modelId) {
    if (currentModel) {
        scene.remove(currentModel);
        // Dispose of previous model's geometry and material
        currentModel.traverse(object => {
            if (object.isMesh) {
                object.geometry.dispose();
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => material.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });
    }

    try {
        const response = await fetch(`/api/model/${modelId}`);
        if (!response.ok) {
            console.error("Failed to fetch model:", await response.text());
            return;
        }

        const modelData = await response.arrayBuffer();
        const mesh = parseRSMV(modelData);
        currentModel = mesh;
        scene.add(currentModel);
        console.log('RuneScape model loaded and added to scene.', currentModel);

        // Center the camera on the new model
        const box = new THREE.Box3().setFromObject(currentModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.5; // Add some padding

        camera.position.set(center.x, center.y, center.z + cameraZ);
        controls.target.set(center.x, center.y, center.z);
        controls.update();

    } catch (error) {
        console.error('Error fetching or parsing model:', error);
    }
}

// Color changing logic
const colorInput = document.getElementById('model-color');
colorInput.addEventListener('input', (event) => {
    const hexColor = event.target.value;

    if (currentModel) {
        currentModel.traverse(object => {
            if (object.isMesh && object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => {
                        if (material.color) {
                            material.color.set(hexColor);
                        }
                    });
                } else if (object.material.color) {
                    object.material.color.set(hexColor);
                }
            }
        });
    }
});

// Save functionality
const saveButton = document.getElementById('save-model');
saveButton.addEventListener('click', async () => {
    if (!currentModel) {
        console.warn('No model loaded to save.');
        return;
    }

    // Capture image
    const imageData = renderer.domElement.toDataURL('image/png');

    // Capture metadata
    const modelId = '123'; // Placeholder, ideally from loaded model
    const currentColor = colorInput.value;
    const metadata = {
        modelId: modelId,
        color: currentColor,
        timestamp: new Date().toISOString(),
        // Add other relevant metadata here
    };

    try {
        const response = await fetch('/api/model/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ imageData, metadata }),
        });

        if (response.ok) {
            console.log('Model saved successfully!');
            alert('Model saved successfully!');
        } else {
            console.error('Failed to save model:', response.statusText);
            alert('Failed to save model.');
        }
    } catch (error) {
        console.error('Error saving model:', error);
        alert('Error saving model.');
    }
});

// Initial model load
loadModel('123'); // Using a placeholder ID for now

// 6. Animation Loop
function animate() {
	requestAnimationFrame(animate);

	controls.update(); // only required if controls.enableDamping is set to true

	renderer.render(scene, camera);
}
animate();

// Handle window resize
window.addEventListener('resize', () => {
    const width = viewerContainer.clientWidth;
    const height = viewerContainer.clientHeight;
	camera.aspect = width / height;
	camera.updateProjectionMatrix();
	renderer.setSize(width, height);
});

// Chat Interface Logic
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const messagesDiv = document.getElementById('messages');

chatForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	const message = chatInput.value.trim();
	if (message) {
		addMessage(message, 'user');
		chatInput.value = '';
		try {
			const response = await fetch('/api/chat', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ message }),
			});
			const data = await response.json();
			addMessage(data.response, 'ai');
		} catch (error) {
			console.error('Error sending message to AI:', error);
			addMessage('Error: Could not connect to AI.', 'ai');
		}
	}
});

function addMessage(text, sender) {
	const messageElement = document.createElement('div');
	messageElement.classList.add('message', sender);
	messageElement.textContent = text;
	messagesDiv.appendChild(messageElement);
	messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

document.addEventListener('DOMContentLoaded', () => {
    const app = document.getElementById('app');
    
    // Add version info
    const version = document.createElement('p');
    version.textContent = `Version: ${new Date().toISOString()}`;
    version.style.color = '#666';
    version.style.fontSize = '0.8em';
    app.appendChild(version);

    // Test KV connection
    fetch('/test-kv')
        .then(response => response.json())
        .then(data => {
            const status = document.createElement('pre');
            status.textContent = JSON.stringify(data, null, 2);
            app.appendChild(status);
        })
        .catch(error => console.error('Error:', error));
});
