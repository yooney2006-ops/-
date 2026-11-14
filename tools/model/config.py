"""Z-Anatomy 메쉬 → 앱 근육 구분·뼈대 연결 규칙. extract.py(Blender)와 build.py(numpy)가 같이 쓴다."""
import re

# ── 뺄 것: 근육을 덮는 막, 점액낭, 건초, 몸 안쪽 깊은 근육, 눈·목구멍·골반저 근육 ──
EXCLUDE = re.compile("|".join([
    r"bursa", r"sheath", r"septum", r"fascia", r"Fascia lata", r"Platysma", r"Diaphragm", r"Transversalis",
    r"arch", r"Internal intercostal", r"Innermost intercostal", r"Transversus", r"Internal abdominal oblique",
    r"pharyn", r"aryten", r"crico", r"[Tt]hyro", r"[Pp]alat", r"[Ss]tylo", r"glossus", r"Geniohyoid", r"Mylohyoid",
    r"Levator ani", r"occygeus", r"anal", r"Pubo", r"(Superior|Inferior|Lateral|Medial) rectus muscle",
    r"(Superior|Inferior) oblique muscle", r"Trochlea", r"tarsus", r"palpebrae", r"tendinous ring",
    r"pterygoid", r"Rotatores", r"Interspinales", r"intertransversarii", r"Levatores", r"Serratus posterior",
    r"capitis muscle", r"Longus c", r"Subscapularis", r"Obturator", r"gemellus", r"Quadratus femoris",
    r"Piriformis", r"Popliteus", r"transverse meta", r"Tendon of extensor digitorum longus",
    # 뼈 쪽
    r"Incus", r"Malleus", r"Stapes", r"cells of ethmoid", r"Sinus of", r"cartilage\b(?<!Costal cartilage)", r"concha",
    r"Vomer", r"Palatine", r"Lacrimal", r"Ethmoid", r"Hyoid",
]))
KEEP = re.compile(r"Costal cartilage|Nasal septal cartilage|Major alar cartilage|Lateral process of nasal")

# ── 앱 근육 키 (src/data/exercises.js의 MUSCLE_KO). 위에서부터 먼저 맞는 규칙을 쓴다 ──
MUSCLE_KEYS = [
    (r"Clavicular head of pectoralis major", ["uchest"]),
    (r"pectoralis major", ["chest"]),
    (r"Clavicular part of deltoid", ["fdelt"]),
    (r"Acromial part of deltoid", ["sdelt"]),
    (r"Scapular spinal part of deltoid", ["rdelt"]),
    (r"Latissimus dorsi|Teres major", ["lats"]),
    (r"Transverse part of trapezius", ["rhom", "traps"]),   # 앱의 '능형근·중부 승모'
    (r"trapezius", ["traps"]),
    (r"Rhomboid", ["rhom"]),
    (r"Iliocostalis|Longissimus (thoracis|colli)|Spinalis (thoracis|colli)|Multifidus|Semispinalis thoracis", ["erect"]),
    (r"biceps brachii", ["bi"]),
    (r"triceps brachii", ["tri"]),
    (r"Brachioradialis|carpi|Extensor digitorum\.|Extensor digiti minimi\.|Extensor indicis|pollicis longus|Extensor pollicis brevis"
     r"|digitorum superficialis|digitorum profundus|Palmaris longus|[Pp]ronator|Supinator", ["fore"]),
    (r"Rectus abdominis|Pyramidalis", ["abs"]),
    (r"External abdominal oblique", ["obl"]),
    (r"Gluteus maximus", ["glute"]),
    (r"Gluteus medius|Gluteus minimus|Tensor fasciae latae", ["abd"]),
    (r"Rectus femoris|Vastus", ["quad"]),
    (r"biceps femoris|Semitendinosus|Semimembranosus", ["ham"]),
    (r"Adductor (longus|brevis|magnus|minimus)|Gracilis|Pectineus", ["add"]),
    (r"gastrocnemius|Soleus|Plantaris", ["calf"]),
    (r"Iliacus|Psoas major", ["hipflex"]),
]
MUSCLE_KEYS = [(re.compile(p), k) for p, k in MUSCLE_KEYS]
TENDON = re.compile(r"Iliotibial|aponeurosis|Calcaneal tendon|Linea alba|retinaculum|Inguinal ligament|ligament")

# ── 뼈대 연결 분류 ──
ARM_BONE = [(re.compile(r"Humerus"), "ua"), (re.compile(r"Radius|Ulna"), "fa"),
            (re.compile(r"of hand|metacarpal|Scaphoid|Lunate|Triquetrum|Pisiform|Trapezium|Trapezoid|Capitate|Hamate"), "hand")]
LEG_BONE = [(re.compile(r"Femur"), "th"), (re.compile(r"Patella|Tibia|Fibula"), "sh"),
            (re.compile(r"of foot|metatarsal|Calcaneus|Talus|Navicular|Cuboid|[Cc]uneiform"), "ft")]
PELVIS_BONE = re.compile(r"Hip bone|Sacrum|Coccyx")
CLAV_BONE = re.compile(r"Clavicle|Scapula")
HEAD = re.compile(r"Frontal bone|Parietal|Occipital bone|Temporal bone|Sphenoid|Maxilla|Mandible|Zygomatic bone|Nasal|alar cartilage"
                  r"|incisor|canine|molar|premolar|Atlas|Axis|Masseter|masseter|Temporalis|Temporoparietalis|Frontalis|Occipitalis|Epicranial"
                  r"|orbicularis|Orbicularis|Zygomaticus|Levator labii|Levator anguli|Levator nasolabialis|Depressor|Mentalis|Bucinator"
                  r"|Risorius|Procerus|Nasalis|Corrugator|temporal")
# 팔에 붙는 근육(어깨를 넘나드는 것 포함) / 다리에 붙는 근육(고관절을 넘나드는 것 포함)
ARM_MUSCLE = re.compile(r"pectoralis major|Latissimus|Teres|Infraspinatus|Supraspinatus|deltoid|Coracobrachialis|brachii|Brachialis|Anconeus"
                        r"|Brachioradialis|carpi|Extensor digitorum\.|Extensor digiti minimi\.|Extensor indicis|pollicis|digitorum superficialis"
                        r"|digitorum profundus|Palmaris|[Pp]ronator|Supinator|of hand|Palmar|of wrist|adductor pollicis")
LEG_MUSCLE = re.compile(r"Gluteus|Tensor fasciae|Iliotibial|Iliacus|Psoas|Sartorius|femoris|Vastus|Pectineus|Adductor (longus|brevis|magnus|minimus)"
                        r"|Gracilis|Semitendinosus|Semimembranosus|gastrocnemius|Soleus|Plantaris|Calcaneal|Tibialis|Fibularis|hallucis"
                        r"|digitorum longus|digitorum brevis|of foot|Plantar|Quadratus plantae|of ankle|fibular retinaculum|patellar"
                        r"|Adductor hallucis|Flexor hallucis brevis|Abductor hallucis")
# 어깨뼈(견갑골)와 같이 오르내리는 근육
GIRDLE = re.compile(r"trapezius|Rhomboid|Levator scapulae|Serratus anterior|Pectoralis minor|Subclavius")


def included(name, npoly):
    if npoly == 0 or name.endswith((".j", ".g")):
        return False
    if KEEP.search(name):
        return True
    return not EXCLUDE.search(name)


def side_of(name):
    return "L" if name.endswith(".l") else "R" if name.endswith(".r") else ""


def keys_of(name):
    for rx, k in MUSCLE_KEYS:
        if rx.search(name):
            return k
    return []
