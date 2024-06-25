// sceneSetup.js
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { CSM } from 'three/examples/jsm/csm/CSM';

export function initializeScene() {
    // 創建場景
    const scene = new THREE.Scene();

    // 創建渲染器
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.domElement.id = 'canvas';
    document.body.appendChild(renderer.domElement);
    renderer.setClearColor(0xd1fcff);

    // 創建相機
    const camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(0, 15, -20);

    // 調整方向光和 CSM
    const csm = new CSM({
        maxFar: camera.far,
        cascades: 4,
        shadowMapSize: 4096,
        lightDirection: new THREE.Vector3(-1, -1, 0.5),
        camera: camera,
        parent: scene,
        shadowBias: -0.0005
    });
    csm.lights.forEach(light => {
        light.intensity = 0.7; // 調整 CSM 光源強度
    });

    // 減少環境光和半球光的亮度
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const hemisphereLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.4);
    scene.add(hemisphereLight);

    renderer.outputColorSpace = THREE.SRGBColorSpace; // 確保渲染的顏色在大多數螢幕上顯示正確，使 HDR 圖像在標準顯示設備上可視且盡量保留其細節和質感的圖像處理技術
    renderer.toneMapping = THREE.ACESFilmicToneMapping; // ACESFilmicToneMapping 是一種模仿電影色調和色彩感知的映射方式，它可以讓圖像看起來更具有電影感，並更好地處理亮部和暗部的細節
    renderer.toneMappingExposure = 1.25; // 設定色調映射的曝光值

    const pointerLockControls = new PointerLockControls(camera, renderer.domElement);
    pointerLockControls.pointerSpeed = 0.2;

    return { scene, camera, renderer, pointerLockControls, csm };
}

// 調整窗口大小時的事件處理
export function onWindowResize(camera, renderer) {
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}