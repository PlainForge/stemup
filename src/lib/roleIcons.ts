// The icons and colors a role can have (roles/{id}.icon and .iconColor), picked
// by its instructors and admins from this list only, so nobody can upload one.
// Kept in sync with mobile/lib/widgets/role_icons.dart (same keys).
import {
    faAtom, faBaseball, faBasketball, faBicycle, faBolt, faBookOpen, faBrain, faBriefcase, faCalculator, faCamera,
    faChartLine, faChessKnight, faCode, faComments, faCompass, faCrown, faCubes, faDice, faDna, faDrum, faDumbbell,
    faEarthAmericas, faFeather, faFilm, faFire, faFlag, faFlask, faFootball, faFutbol, faGamepad, faGears, faGlobe,
    faGraduationCap, faGuitar, faHammer, faHandHoldingHeart, faHeart, faHeartPulse, faLandmark, faLanguage, faLaptopCode,
    faLeaf, faLightbulb, faMasksTheater, faMedal, faMicrochip, faMicrophone, faMicroscope, faMoon, faMountain, faMugHot,
    faMusic, faNewspaper, faPaintbrush, faPalette, faPaw, faPencil, faPeopleGroup, faPersonRunning, faPersonSwimming,
    faPuzzlePiece, faRecycle, faRobot, faRocket, faSatellite, faScaleBalanced, faScrewdriverWrench, faSeedling, faShapes,
    faStar, faStethoscope, faSun, faTree, faTrophy, faUsers, faUtensils, faVolleyball,
    type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";

export type RoleIconOption = { key: string; label: string; icon: IconDefinition };

export const ROLE_ICON_GROUPS: { title: string; icons: RoleIconOption[] }[] = [
    {
        title: "Science & Tech",
        icons: [
            { key: "robot", label: "Robot", icon: faRobot },
            { key: "flask", label: "Flask", icon: faFlask },
            { key: "atom", label: "Atom", icon: faAtom },
            { key: "microscope", label: "Microscope", icon: faMicroscope },
            { key: "dna", label: "DNA", icon: faDna },
            { key: "calculator", label: "Calculator", icon: faCalculator },
            { key: "laptopCode", label: "Laptop", icon: faLaptopCode },
            { key: "code", label: "Code", icon: faCode },
            { key: "microchip", label: "Microchip", icon: faMicrochip },
            { key: "gears", label: "Gears", icon: faGears },
            { key: "screwdriverWrench", label: "Tools", icon: faScrewdriverWrench },
            { key: "hammer", label: "Hammer", icon: faHammer },
            { key: "rocket", label: "Rocket", icon: faRocket },
            { key: "satellite", label: "Satellite", icon: faSatellite },
            { key: "bolt", label: "Bolt", icon: faBolt },
            { key: "lightbulb", label: "Idea", icon: faLightbulb },
            { key: "brain", label: "Brain", icon: faBrain },
            { key: "chartLine", label: "Chart", icon: faChartLine },
            { key: "cubes", label: "Cubes", icon: faCubes },
            { key: "shapes", label: "Shapes", icon: faShapes },
        ],
    },
    {
        title: "Arts & Media",
        icons: [
            { key: "paintbrush", label: "Paintbrush", icon: faPaintbrush },
            { key: "palette", label: "Palette", icon: faPalette },
            { key: "pencil", label: "Pencil", icon: faPencil },
            { key: "feather", label: "Feather", icon: faFeather },
            { key: "music", label: "Music", icon: faMusic },
            { key: "guitar", label: "Guitar", icon: faGuitar },
            { key: "drum", label: "Drum", icon: faDrum },
            { key: "microphone", label: "Microphone", icon: faMicrophone },
            { key: "camera", label: "Camera", icon: faCamera },
            { key: "film", label: "Film", icon: faFilm },
            { key: "masksTheater", label: "Theater", icon: faMasksTheater },
            { key: "newspaper", label: "Newspaper", icon: faNewspaper },
            { key: "bookOpen", label: "Book", icon: faBookOpen },
            { key: "language", label: "Language", icon: faLanguage },
        ],
    },
    {
        title: "Sports & Games",
        icons: [
            { key: "trophy", label: "Trophy", icon: faTrophy },
            { key: "medal", label: "Medal", icon: faMedal },
            { key: "futbol", label: "Soccer", icon: faFutbol },
            { key: "basketball", label: "Basketball", icon: faBasketball },
            { key: "baseball", label: "Baseball", icon: faBaseball },
            { key: "volleyball", label: "Volleyball", icon: faVolleyball },
            { key: "football", label: "Football", icon: faFootball },
            { key: "personRunning", label: "Running", icon: faPersonRunning },
            { key: "personSwimming", label: "Swimming", icon: faPersonSwimming },
            { key: "bicycle", label: "Cycling", icon: faBicycle },
            { key: "dumbbell", label: "Fitness", icon: faDumbbell },
            { key: "chessKnight", label: "Chess", icon: faChessKnight },
            { key: "puzzlePiece", label: "Puzzle", icon: faPuzzlePiece },
            { key: "gamepad", label: "Gaming", icon: faGamepad },
            { key: "dice", label: "Dice", icon: faDice },
        ],
    },
    {
        title: "Clubs & Community",
        icons: [
            { key: "users", label: "Team", icon: faUsers },
            { key: "peopleGroup", label: "Group", icon: faPeopleGroup },
            { key: "comments", label: "Discussion", icon: faComments },
            { key: "handHoldingHeart", label: "Volunteering", icon: faHandHoldingHeart },
            { key: "heart", label: "Heart", icon: faHeart },
            { key: "graduationCap", label: "Graduation", icon: faGraduationCap },
            { key: "briefcase", label: "Business", icon: faBriefcase },
            { key: "scaleBalanced", label: "Debate", icon: faScaleBalanced },
            { key: "landmark", label: "Government", icon: faLandmark },
            { key: "globe", label: "Globe", icon: faGlobe },
            { key: "stethoscope", label: "Medicine", icon: faStethoscope },
            { key: "heartPulse", label: "Health", icon: faHeartPulse },
            { key: "utensils", label: "Cooking", icon: faUtensils },
            { key: "mugHot", label: "Café", icon: faMugHot },
            { key: "flag", label: "Flag", icon: faFlag },
            { key: "star", label: "Star", icon: faStar },
            { key: "crown", label: "Crown", icon: faCrown },
        ],
    },
    {
        title: "Nature & More",
        icons: [
            { key: "leaf", label: "Leaf", icon: faLeaf },
            { key: "seedling", label: "Seedling", icon: faSeedling },
            { key: "tree", label: "Tree", icon: faTree },
            { key: "recycle", label: "Recycling", icon: faRecycle },
            { key: "earthAmericas", label: "Earth", icon: faEarthAmericas },
            { key: "mountain", label: "Mountain", icon: faMountain },
            { key: "compass", label: "Compass", icon: faCompass },
            { key: "paw", label: "Animals", icon: faPaw },
            { key: "sun", label: "Sun", icon: faSun },
            { key: "moon", label: "Moon", icon: faMoon },
            { key: "fire", label: "Fire", icon: faFire },
        ],
    },
];

export const ROLE_COLORS: { key: string; label: string; hex: string }[] = [
    { key: "blue", label: "Blue", hex: "#2563eb" },
    { key: "sky", label: "Sky", hex: "#0284c7" },
    { key: "cyan", label: "Cyan", hex: "#0891b2" },
    { key: "teal", label: "Teal", hex: "#0d9488" },
    { key: "emerald", label: "Emerald", hex: "#059669" },
    { key: "green", label: "Green", hex: "#16a34a" },
    { key: "lime", label: "Lime", hex: "#65a30d" },
    { key: "amber", label: "Amber", hex: "#d97706" },
    { key: "orange", label: "Orange", hex: "#ea580c" },
    { key: "red", label: "Red", hex: "#dc2626" },
    { key: "rose", label: "Rose", hex: "#e11d48" },
    { key: "pink", label: "Pink", hex: "#db2777" },
    { key: "fuchsia", label: "Fuchsia", hex: "#c026d3" },
    { key: "purple", label: "Purple", hex: "#9333ea" },
    { key: "violet", label: "Violet", hex: "#7c3aed" },
    { key: "indigo", label: "Indigo", hex: "#4f46e5" },
    { key: "slate", label: "Slate", hex: "#475569" },
];

export const DEFAULT_ROLE_ICON = "users";
export const DEFAULT_ROLE_COLOR = "blue";

const ICONS = new Map(ROLE_ICON_GROUPS.flatMap(g => g.icons).map(o => [o.key, o]));
const COLORS = new Map(ROLE_COLORS.map(c => [c.key, c]));

/** A role's icon and color, falling back to the defaults for unset or unknown keys */
export function roleLook(role: { icon?: string; iconColor?: string } | null | undefined) {
    const icon = ICONS.get(role?.icon ?? "") ?? ICONS.get(DEFAULT_ROLE_ICON)!;
    const color = COLORS.get(role?.iconColor ?? "") ?? COLORS.get(DEFAULT_ROLE_COLOR)!;
    return { icon, color };
}

export const isRoleIconKey = (key: string) => ICONS.has(key);
export const isRoleColorKey = (key: string) => COLORS.has(key);
