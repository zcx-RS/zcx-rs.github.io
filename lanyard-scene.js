import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, extend, useFrame } from "@react-three/fiber";
import { Environment, Lightformer, useGLTF, useTexture } from "@react-three/drei";
import {
    BallCollider,
    CuboidCollider,
    Physics,
    RigidBody,
    useRopeJoint,
    useSphericalJoint
} from "@react-three/rapier";
import { MeshLineGeometry, MeshLineMaterial } from "meshline";
import * as THREE from "three";

extend({ MeshLineGeometry, MeshLineMaterial });

const h = React.createElement;

function isFinitePoint(point) {
    return point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function getFiniteTranslation(body) {
    const translation = body?.translation?.();
    return isFinitePoint(translation) ? translation : null;
}

function Lanyard({
    position = [0, 0, 24],
    gravity = [0, -40, 0],
    fov = 20,
    transparent = true,
    cardUrl,
    textureUrl
}) {
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return h(
        "div",
        { className: "lanyard-wrapper" },
        h(
            Canvas,
            {
                camera: { position, fov },
                dpr: [1, isMobile ? 1.5 : 2],
                gl: { alpha: transparent, antialias: true },
                onCreated: ({ gl }) => {
                    gl.setClearColor(new THREE.Color(0x000000), transparent ? 0 : 1);
                    gl.outputColorSpace = THREE.SRGBColorSpace;
                }
            },
            h("ambientLight", { intensity: Math.PI }),
            h(
                Suspense,
                { fallback: null },
                h(
                    Physics,
                    { gravity, timeStep: isMobile ? 1 / 30 : 1 / 60 },
                    h(Band, { isMobile, cardUrl, textureUrl })
                ),
                h(
                    Environment,
                    { blur: 0.75 },
                    h(Lightformer, {
                        intensity: 2,
                        color: "white",
                        position: [0, -1, 5],
                        rotation: [0, 0, Math.PI / 3],
                        scale: [100, 0.1, 1]
                    }),
                    h(Lightformer, {
                        intensity: 3,
                        color: "white",
                        position: [-1, -1, 1],
                        rotation: [0, 0, Math.PI / 3],
                        scale: [100, 0.1, 1]
                    }),
                    h(Lightformer, {
                        intensity: 3,
                        color: "white",
                        position: [1, 1, 1],
                        rotation: [0, 0, Math.PI / 3],
                        scale: [100, 0.1, 1]
                    }),
                    h(Lightformer, {
                        intensity: 10,
                        color: "white",
                        position: [-10, 0, 14],
                        rotation: [0, Math.PI / 2, Math.PI / 3],
                        scale: [100, 10, 1]
                    })
                )
            )
        )
    );
}

function Band({ maxSpeed = 50, minSpeed = 0, isMobile = false, cardUrl, textureUrl }) {
    const band = useRef();
    const fixed = useRef();
    const j1 = useRef();
    const j2 = useRef();
    const j3 = useRef();
    const card = useRef();
    const vec = useMemo(() => new THREE.Vector3(), []);
    const ang = useMemo(() => new THREE.Vector3(), []);
    const rot = useMemo(() => new THREE.Vector3(), []);
    const dir = useMemo(() => new THREE.Vector3(), []);
    const segmentProps = useMemo(
        () => ({ type: "dynamic", canSleep: true, colliders: false, angularDamping: 4, linearDamping: 4 }),
        []
    );
    const { nodes, materials } = useGLTF(cardUrl);
    const texture = useTexture(textureUrl);
    const curve = useMemo(
        () =>
            new THREE.CatmullRomCurve3([
                new THREE.Vector3(),
                new THREE.Vector3(),
                new THREE.Vector3(),
                new THREE.Vector3()
            ]),
        []
    );
    const [dragged, drag] = useState(false);
    const [hovered, hover] = useState(false);

    useRopeJoint(fixed, j1, [
        [0, 0, 0],
        [0, 0, 0],
        1
    ]);
    useRopeJoint(j1, j2, [
        [0, 0, 0],
        [0, 0, 0],
        1
    ]);
    useRopeJoint(j2, j3, [
        [0, 0, 0],
        [0, 0, 0],
        1
    ]);
    useSphericalJoint(j3, card, [
        [0, 0, 0],
        [0, 1.5, 0]
    ]);

    useEffect(() => {
        if (!hovered) return undefined;
        document.body.style.cursor = dragged ? "grabbing" : "grab";
        return () => {
            document.body.style.cursor = "auto";
        };
    }, [hovered, dragged]);

    useFrame((state, delta) => {
        if (!fixed.current || !j1.current || !j2.current || !j3.current || !card.current) return;

        const fixedPos = getFiniteTranslation(fixed.current);
        const j1Pos = getFiniteTranslation(j1.current);
        const j2Pos = getFiniteTranslation(j2.current);
        const j3Pos = getFiniteTranslation(j3.current);
        const cardPos = getFiniteTranslation(card.current);
        if (!fixedPos || !j1Pos || !j2Pos || !j3Pos || !cardPos) return;

        if (dragged) {
            vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera);
            dir.copy(vec).sub(state.camera.position).normalize();
            vec.add(dir.multiplyScalar(state.camera.position.length()));
            if (!isFinitePoint(vec) || !isFinitePoint(dragged)) return;
            [card, j1, j2, j3, fixed].forEach(ref => ref.current?.wakeUp());
            card.current.setNextKinematicTranslation({
                x: vec.x - dragged.x,
                y: vec.y - dragged.y,
                z: vec.z - dragged.z
            });
        }

        [
            [j1, j1Pos],
            [j2, j2Pos]
        ].forEach(([ref, position]) => {
            if (!isFinitePoint(ref.current.lerped)) ref.current.lerped = new THREE.Vector3().copy(position);
            const distance = ref.current.lerped.distanceTo(position);
            if (!Number.isFinite(distance)) {
                ref.current.lerped.copy(position);
                return;
            }
            const clampedDistance = Math.max(0.1, Math.min(1, distance));
            ref.current.lerped.lerp(position, delta * (minSpeed + clampedDistance * (maxSpeed - minSpeed)));
        });

        curve.points[0].copy(j3Pos);
        curve.points[1].copy(j2.current.lerped);
        curve.points[2].copy(j1.current.lerped);
        curve.points[3].copy(fixedPos);
        const ropePoints = curve.getPoints(isMobile ? 16 : 32);
        if (ropePoints.every(isFinitePoint)) band.current?.geometry?.setPoints(ropePoints);

        const angularVelocity = card.current.angvel();
        const rotation = card.current.rotation();
        if (isFinitePoint(angularVelocity) && isFinitePoint(rotation)) {
            ang.copy(angularVelocity);
            rot.copy(rotation);
            card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z }, true);
        }
    });

    curve.curveType = "chordal";
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    const anchorY = isMobile ? 3.95 : 3.65;
    const cardScale = 2.25;

    return h(
        React.Fragment,
        null,
        h(
            "group",
            { position: [0, anchorY, 0] },
            h(RigidBody, { ref: fixed, ...segmentProps, type: "fixed" }),
            h(RigidBody, { position: [0.5, 0, 0], ref: j1, ...segmentProps }, h(BallCollider, { args: [0.1] })),
            h(RigidBody, { position: [1, 0, 0], ref: j2, ...segmentProps }, h(BallCollider, { args: [0.1] })),
            h(RigidBody, { position: [1.5, 0, 0], ref: j3, ...segmentProps }, h(BallCollider, { args: [0.1] })),
            h(
                RigidBody,
                { position: [2, 0, 0], ref: card, ...segmentProps, type: dragged ? "kinematicPosition" : "dynamic" },
                h(CuboidCollider, { args: [0.8, 1.125, 0.01] }),
                h(
                    "group",
                    {
                        scale: cardScale,
                        position: [0, -1.2, -0.05],
                        onPointerOver: () => hover(true),
                        onPointerOut: () => hover(false),
                        onPointerUp: event => {
                            event.target.releasePointerCapture(event.pointerId);
                            drag(false);
                        },
                        onPointerDown: event => {
                            event.target.setPointerCapture(event.pointerId);
                            const cardPosition = getFiniteTranslation(card.current);
                            if (cardPosition) drag(new THREE.Vector3().copy(event.point).sub(vec.copy(cardPosition)));
                        }
                    },
                    h(
                        "mesh",
                        { geometry: nodes.card.geometry },
                        h("meshPhysicalMaterial", {
                            map: materials.base.map,
                            "map-anisotropy": 16,
                            clearcoat: isMobile ? 0 : 1,
                            clearcoatRoughness: 0.15,
                            roughness: 0.9,
                            metalness: 0.8
                        })
                    ),
                    h("mesh", {
                        geometry: nodes.clip.geometry,
                        material: materials.metal,
                        "material-roughness": 0.3
                    }),
                    h("mesh", { geometry: nodes.clamp.geometry, material: materials.metal })
                )
            )
        ),
        h(
            "mesh",
            { ref: band },
            h("meshLineGeometry", null),
            h("meshLineMaterial", {
                color: "white",
                depthTest: false,
                resolution: isMobile ? [1000, 2000] : [1000, 1000],
                useMap: true,
                map: texture,
                repeat: [-4, 1],
                lineWidth: 1
            })
        )
    );
}

function resolveLanyardAssets(mount) {
    return {
        cardUrl: mount.dataset.card || new URL("./card.glb", import.meta.url).href,
        textureUrl: mount.dataset.lanyard || new URL("./lanyard.png", import.meta.url).href
    };
}

export function preloadLanyard(mount) {
    if (!mount) return;
    const { cardUrl, textureUrl } = resolveLanyardAssets(mount);
    useGLTF.preload(cardUrl);
    useTexture.preload(textureUrl);
}

export function mountLanyard(mount) {
    if (!mount) return () => {};

    const { cardUrl, textureUrl } = resolveLanyardAssets(mount);
    preloadLanyard(mount);

    const root = createRoot(mount);
    root.render(h(Lanyard, { cardUrl, textureUrl }));
    return () => root.unmount();
}
