# 인체 모형 만들기 (public/models/body.glb)

원본: [Z-Anatomy](https://github.com/Z-Anatomy/Models-of-human-anatomy) (CC BY-SA 4.0, BodyParts3D 기반). 결과물도 CC BY-SA 4.0.

```bash
git clone --depth 1 https://github.com/Z-Anatomy/Models-of-human-anatomy za && unzip za/Z-Anatomy.zip -d za
python3.11 -m venv venv && venv/bin/pip install bpy        # Blender를 파이썬 모듈로
venv/bin/python tools/model/extract.py za/Z-Anatomy/Startup.blend raw.npz 90000   # 근육·뼈 선별 + 삼각형 수 축소 (1~2분)
venv/bin/python tools/model/build.py raw.npz public/models/body.glb               # 뼈대 연결·비율 맞춤·glb 저장 (수 초)
```

- `config.py` 어떤 메쉬를 쓰고, 앱의 어느 근육 키(대흉근 `chest` 등)에 넣고, 어느 뼈에 붙일지 정하는 규칙.
- `extract.py` Blender가 필요한 단계. 603개 부위를 약 9만 삼각형으로.
- `build.py` 관절 위치 추정 → 손가락을 쥔 모양으로 굽힘 → 발바닥 평평하게 → 뼈 24개 가중치 → 동작 엔진(fig.js)의 팔다리 길이에 맞춤 → glb.
- 앱에서는 `src/engine/body.js`가 읽어서 fig.js의 관절을 뼈 변환으로 바꾸고, `figgl.js`가 그린다.

가중치나 근육 분류만 바꿀 때는 `build.py`만 다시 돌리면 된다.
