import {
  getSubjectsForExam,
  type ClassLevel,
  type ExamType,
  type SubjectType,
} from '../types/obren';

export type ChapterWeightage = 'HIGH' | 'MEDIUM' | 'CORE';

export interface SyllabusChapter {
  key: string;
  name: string;
  classLevel: ClassLevel;
  subject: SubjectType;
  unit: string;
  unitOrder: number;
  weightage: ChapterWeightage;
  keywords: string[];
}

export interface RoadmapUnit {
  unit: string;
  unitOrder: number;
  chapters: SyllabusChapter[];
}

export interface RoadmapSubjectCurriculum {
  subject: SubjectType;
  units: RoadmapUnit[];
  chapters: SyllabusChapter[];
}

interface RawChapterDef {
  name: string;
  classLevel: ClassLevel;
  unit: string;
  unitOrder: number;
  weightage: ChapterWeightage;
  neetWeightage?: ChapterWeightage;
  advWeightage?: ChapterWeightage;
  keywords?: string[];
}

export function getChapterKey(
  subject: SubjectType,
  classLevel: ClassLevel,
  name: string
): string {
  return `${subject}::${classLevel}::${name}`;
}

const PHYSICS_DEFS: RawChapterDef[] = [
  {
    name: 'Units & Measurements',
    classLevel: '11',
    unit: 'Mechanics I: Kinematics & Motion',
    unitOrder: 1,
    weightage: 'MEDIUM',
    neetWeightage: 'HIGH',
    keywords: ['units', 'dimensions', 'errors', 'vernier', 'screw gauge'],
  },
  {
    name: 'Kinematics (Motion in 1D & 2D)',
    classLevel: '11',
    unit: 'Mechanics I: Kinematics & Motion',
    unitOrder: 1,
    weightage: 'HIGH',
    keywords: ['kinematics', 'projectile', 'relative motion', 'motion in'],
  },
  {
    name: 'Laws of Motion & Friction',
    classLevel: '11',
    unit: 'Mechanics I: Kinematics & Motion',
    unitOrder: 1,
    weightage: 'HIGH',
    keywords: ['laws of motion', 'newton', 'friction', 'circular motion', 'nlm'],
  },
  {
    name: 'Work, Energy & Power',
    classLevel: '11',
    unit: 'Mechanics II: Energy, Rotation & Gravitation',
    unitOrder: 2,
    weightage: 'HIGH',
    keywords: ['work', 'energy', 'power', 'spring', 'conservative'],
  },
  {
    name: 'Center of Mass & Collisions',
    classLevel: '11',
    unit: 'Mechanics II: Energy, Rotation & Gravitation',
    unitOrder: 2,
    weightage: 'MEDIUM',
    advWeightage: 'HIGH',
    keywords: ['center of mass', 'centre of mass', 'momentum', 'collision'],
  },
  {
    name: 'Rotational Motion',
    classLevel: '11',
    unit: 'Mechanics II: Energy, Rotation & Gravitation',
    unitOrder: 2,
    weightage: 'HIGH',
    keywords: ['rotational', 'torque', 'moment of inertia', 'angular momentum', 'rolling'],
  },
  {
    name: 'Gravitation',
    classLevel: '11',
    unit: 'Mechanics II: Energy, Rotation & Gravitation',
    unitOrder: 2,
    weightage: 'HIGH',
    keywords: ['gravitation', 'kepler', 'satellite', 'escape velocity'],
  },
  {
    name: 'Mechanical Properties of Solids & Fluids',
    classLevel: '11',
    unit: 'Properties of Matter & Thermal Physics',
    unitOrder: 3,
    weightage: 'MEDIUM',
    advWeightage: 'HIGH',
    keywords: ['fluids', 'bernoulli', 'viscosity', 'surface tension', 'elasticity', 'solids'],
  },
  {
    name: 'Thermal Properties & Thermodynamics',
    classLevel: '11',
    unit: 'Properties of Matter & Thermal Physics',
    unitOrder: 3,
    weightage: 'HIGH',
    keywords: ['thermodynamics', 'heat', 'calorimetry', 'carnot', 'thermal'],
  },
  {
    name: 'Kinetic Theory of Gases',
    classLevel: '11',
    unit: 'Properties of Matter & Thermal Physics',
    unitOrder: 3,
    weightage: 'MEDIUM',
    neetWeightage: 'HIGH',
    keywords: ['kinetic theory', 'ktg', 'ideal gas', 'rms speed'],
  },
  {
    name: 'Oscillations (SHM)',
    classLevel: '11',
    unit: 'Oscillations & Waves',
    unitOrder: 4,
    weightage: 'MEDIUM',
    advWeightage: 'HIGH',
    keywords: ['shm', 'oscillations', 'pendulum', 'simple harmonic'],
  },
  {
    name: 'Waves & Sound',
    classLevel: '11',
    unit: 'Oscillations & Waves',
    unitOrder: 4,
    weightage: 'MEDIUM',
    keywords: ['waves', 'sound', 'doppler', 'organ pipe', 'standing wave'],
  },
  {
    name: 'Electrostatics & Gauss Law',
    classLevel: '12',
    unit: 'Electrostatics & Current Electricity',
    unitOrder: 5,
    weightage: 'HIGH',
    keywords: ['electrostatics', 'gauss', 'electric field', 'coulomb', 'dipole'],
  },
  {
    name: 'Electrostatic Potential & Capacitance',
    classLevel: '12',
    unit: 'Electrostatics & Current Electricity',
    unitOrder: 5,
    weightage: 'HIGH',
    keywords: ['capacitance', 'capacitor', 'potential', 'dielectric'],
  },
  {
    name: 'Current Electricity',
    classLevel: '12',
    unit: 'Electrostatics & Current Electricity',
    unitOrder: 5,
    weightage: 'HIGH',
    keywords: ['current electricity', 'kirchhoff', 'wheatstone', 'resistor', 'ohm'],
  },
  {
    name: 'Moving Charges & Magnetism',
    classLevel: '12',
    unit: 'Magnetism, EMI & AC Circuits',
    unitOrder: 6,
    weightage: 'HIGH',
    keywords: ['moving charges', 'magnetism', 'biot savart', 'ampere', 'lorentz'],
  },
  {
    name: 'Magnetism & Matter',
    classLevel: '12',
    unit: 'Magnetism, EMI & AC Circuits',
    unitOrder: 6,
    weightage: 'CORE',
    neetWeightage: 'MEDIUM',
    keywords: ['magnetism and matter', 'diamagnetic', 'ferromagnetic', 'earth magnetism'],
  },
  {
    name: 'Electromagnetic Induction',
    classLevel: '12',
    unit: 'Magnetism, EMI & AC Circuits',
    unitOrder: 6,
    weightage: 'HIGH',
    keywords: ['electromagnetic induction', 'emi', 'faraday', 'lenz', 'inductance'],
  },
  {
    name: 'Alternating Current',
    classLevel: '12',
    unit: 'Magnetism, EMI & AC Circuits',
    unitOrder: 6,
    weightage: 'HIGH',
    keywords: ['alternating current', 'lcr', 'resonance', 'transformer', 'ac circuit'],
  },
  {
    name: 'Electromagnetic Waves',
    classLevel: '12',
    unit: 'Optics & Electromagnetic Waves',
    unitOrder: 7,
    weightage: 'CORE',
    keywords: ['em waves', 'electromagnetic waves', 'displacement current'],
  },
  {
    name: 'Ray Optics & Optical Instruments',
    classLevel: '12',
    unit: 'Optics & Electromagnetic Waves',
    unitOrder: 7,
    weightage: 'HIGH',
    keywords: ['ray optics', 'lens', 'mirror', 'prism', 'refraction', 'microscope'],
  },
  {
    name: 'Wave Optics',
    classLevel: '12',
    unit: 'Optics & Electromagnetic Waves',
    unitOrder: 7,
    weightage: 'HIGH',
    keywords: ['wave optics', 'ydse', 'interference', 'diffraction', 'polarization'],
  },
  {
    name: 'Dual Nature of Radiation & Matter',
    classLevel: '12',
    unit: 'Modern Physics & Electronics',
    unitOrder: 8,
    weightage: 'HIGH',
    keywords: ['dual nature', 'photoelectric', 'de broglie'],
  },
  {
    name: 'Atoms & Nuclei',
    classLevel: '12',
    unit: 'Modern Physics & Electronics',
    unitOrder: 8,
    weightage: 'HIGH',
    keywords: ['atoms', 'nuclei', 'bohr', 'radioactivity', 'binding energy'],
  },
  {
    name: 'Semiconductor Electronics',
    classLevel: '12',
    unit: 'Modern Physics & Electronics',
    unitOrder: 8,
    weightage: 'HIGH',
    advWeightage: 'CORE',
    keywords: ['semiconductor', 'diode', 'logic gate', 'transistor', 'zener'],
  },
];

const CHEMISTRY_DEFS: RawChapterDef[] = [
  {
    name: 'Some Basic Concepts of Chemistry (Mole Concept)',
    classLevel: '11',
    unit: 'Physical Chemistry I: Foundations & Energetics',
    unitOrder: 1,
    weightage: 'HIGH',
    keywords: ['mole concept', 'stoichiometry', 'basic concepts', 'molarity'],
  },
  {
    name: 'Structure of Atom',
    classLevel: '11',
    unit: 'Physical Chemistry I: Foundations & Energetics',
    unitOrder: 1,
    weightage: 'HIGH',
    keywords: ['atomic structure', 'structure of atom', 'quantum number', 'orbital'],
  },
  {
    name: 'Chemical Thermodynamics',
    classLevel: '11',
    unit: 'Physical Chemistry I: Foundations & Energetics',
    unitOrder: 1,
    weightage: 'HIGH',
    keywords: ['thermodynamics', 'enthalpy', 'entropy', 'gibbs', 'hess'],
  },
  {
    name: 'Chemical & Ionic Equilibrium',
    classLevel: '11',
    unit: 'Physical Chemistry I: Foundations & Energetics',
    unitOrder: 1,
    weightage: 'HIGH',
    keywords: ['equilibrium', 'ph', 'buffer', 'solubility product', 'le chatelier'],
  },
  {
    name: 'Redox Reactions',
    classLevel: '11',
    unit: 'Physical Chemistry I: Foundations & Energetics',
    unitOrder: 1,
    weightage: 'CORE',
    keywords: ['redox', 'oxidation number', 'equivalent weight'],
  },
  {
    name: 'Solutions & Colligative Properties',
    classLevel: '12',
    unit: 'Physical Chemistry II: Solutions, Electro & Kinetics',
    unitOrder: 2,
    weightage: 'HIGH',
    keywords: ['solutions', 'colligative', 'raoult', 'osmotic', 'vant hoff'],
  },
  {
    name: 'Electrochemistry',
    classLevel: '12',
    unit: 'Physical Chemistry II: Solutions, Electro & Kinetics',
    unitOrder: 2,
    weightage: 'HIGH',
    keywords: ['electrochemistry', 'nernst', 'conductance', 'faraday', 'galvanic'],
  },
  {
    name: 'Chemical Kinetics',
    classLevel: '12',
    unit: 'Physical Chemistry II: Solutions, Electro & Kinetics',
    unitOrder: 2,
    weightage: 'HIGH',
    keywords: ['chemical kinetics', 'rate law', 'arrhenius', 'half life', 'order of reaction'],
  },
  {
    name: 'Classification of Elements & Periodicity',
    classLevel: '11',
    unit: 'Inorganic Chemistry: Bonding, Blocks & Coordination',
    unitOrder: 3,
    weightage: 'MEDIUM',
    neetWeightage: 'HIGH',
    keywords: ['periodicity', 'periodic table', 'ionization', 'electronegativity'],
  },
  {
    name: 'Chemical Bonding & Molecular Structure',
    classLevel: '11',
    unit: 'Inorganic Chemistry: Bonding, Blocks & Coordination',
    unitOrder: 3,
    weightage: 'HIGH',
    keywords: ['chemical bonding', 'hybridization', 'vsepr', 'mot', 'dipole moment'],
  },
  {
    name: 'p-Block Elements',
    classLevel: '12',
    unit: 'Inorganic Chemistry: Bonding, Blocks & Coordination',
    unitOrder: 3,
    weightage: 'HIGH',
    keywords: ['p-block', 'p block', 'boron', 'nitrogen', 'halogens', 'noble gas'],
  },
  {
    name: 'd- and f-Block Elements',
    classLevel: '12',
    unit: 'Inorganic Chemistry: Bonding, Blocks & Coordination',
    unitOrder: 3,
    weightage: 'HIGH',
    keywords: ['d-block', 'd and f', 'transition', 'lanthanoid', 'kmno4'],
  },
  {
    name: 'Coordination Compounds',
    classLevel: '12',
    unit: 'Inorganic Chemistry: Bonding, Blocks & Coordination',
    unitOrder: 3,
    weightage: 'HIGH',
    keywords: ['coordination', 'crystal field', 'ligand', 'werner', 'isomerism'],
  },
  {
    name: 'Organic Chemistry: GOC & Isomerism',
    classLevel: '11',
    unit: 'Organic Chemistry I: Mechanisms & Hydrocarbons',
    unitOrder: 4,
    weightage: 'HIGH',
    keywords: ['goc', 'general organic', 'isomerism', 'inductive', 'resonance', 'hyperconjugation'],
  },
  {
    name: 'Hydrocarbons',
    classLevel: '11',
    unit: 'Organic Chemistry I: Mechanisms & Hydrocarbons',
    unitOrder: 4,
    weightage: 'HIGH',
    keywords: ['hydrocarbons', 'alkane', 'alkene', 'alkyne', 'benzene', 'aromatic'],
  },
  {
    name: 'Haloalkanes & Haloarenes',
    classLevel: '12',
    unit: 'Organic Chemistry II: Functional Groups & Biomolecules',
    unitOrder: 5,
    weightage: 'MEDIUM',
    advWeightage: 'HIGH',
    keywords: ['haloalkane', 'haloarene', 'sn1', 'sn2', 'elimination'],
  },
  {
    name: 'Alcohols, Phenols & Ethers',
    classLevel: '12',
    unit: 'Organic Chemistry II: Functional Groups & Biomolecules',
    unitOrder: 5,
    weightage: 'HIGH',
    keywords: ['alcohol', 'phenol', 'ether', 'lucas', 'reimer tiemann'],
  },
  {
    name: 'Aldehydes, Ketones & Carboxylic Acids',
    classLevel: '12',
    unit: 'Organic Chemistry II: Functional Groups & Biomolecules',
    unitOrder: 5,
    weightage: 'HIGH',
    keywords: ['aldehyde', 'ketone', 'carboxylic', 'aldol', 'cannizzaro', 'carbonyl'],
  },
  {
    name: 'Amines & Diazonium Salts',
    classLevel: '12',
    unit: 'Organic Chemistry II: Functional Groups & Biomolecules',
    unitOrder: 5,
    weightage: 'HIGH',
    keywords: ['amine', 'diazonium', 'hoffmann', 'carbylamine', 'basicity'],
  },
  {
    name: 'Biomolecules',
    classLevel: '12',
    unit: 'Organic Chemistry II: Functional Groups & Biomolecules',
    unitOrder: 5,
    weightage: 'MEDIUM',
    neetWeightage: 'HIGH',
    keywords: ['biomolecules', 'carbohydrate', 'protein', 'amino acid', 'nucleic'],
  },
  {
    name: 'Practical & Analytical Chemistry',
    classLevel: '12',
    unit: 'Organic Chemistry II: Functional Groups & Biomolecules',
    unitOrder: 5,
    weightage: 'CORE',
    advWeightage: 'MEDIUM',
    keywords: ['practical', 'qualitative', 'salt analysis', 'titration'],
  },
];

const MATHEMATICS_DEFS: RawChapterDef[] = [
  {
    name: 'Sets, Relations & Functions',
    classLevel: '11',
    unit: 'Algebra & Foundations',
    unitOrder: 1,
    weightage: 'MEDIUM',
    keywords: ['sets', 'relations', 'domain', 'range'],
  },
  {
    name: 'Trigonometric Functions & Equations',
    classLevel: '11',
    unit: 'Algebra & Foundations',
    unitOrder: 1,
    weightage: 'CORE',
    advWeightage: 'MEDIUM',
    keywords: ['trigonometric', 'trigonometry'],
  },
  {
    name: 'Complex Numbers & Quadratic Equations',
    classLevel: '11',
    unit: 'Algebra & Foundations',
    unitOrder: 1,
    weightage: 'HIGH',
    keywords: ['complex number', 'quadratic', 'argand', 'roots'],
  },
  {
    name: 'Sequences & Series',
    classLevel: '11',
    unit: 'Algebra & Foundations',
    unitOrder: 1,
    weightage: 'HIGH',
    keywords: ['sequence', 'series', 'progression', 'am gm'],
  },
  {
    name: 'Permutations & Combinations',
    classLevel: '11',
    unit: 'Combinatorics, Matrices & Probability',
    unitOrder: 2,
    weightage: 'HIGH',
    keywords: ['permutation', 'combination', 'p&c', 'counting'],
  },
  {
    name: 'Binomial Theorem',
    classLevel: '11',
    unit: 'Combinatorics, Matrices & Probability',
    unitOrder: 2,
    weightage: 'HIGH',
    keywords: ['binomial', 'coefficient', 'expansion'],
  },
  {
    name: 'Matrices & Determinants',
    classLevel: '12',
    unit: 'Combinatorics, Matrices & Probability',
    unitOrder: 2,
    weightage: 'HIGH',
    keywords: ['matrix', 'matrices', 'determinant', 'cramer', 'eigen'],
  },
  {
    name: 'Statistics & Probability Basics',
    classLevel: '11',
    unit: 'Combinatorics, Matrices & Probability',
    unitOrder: 2,
    weightage: 'MEDIUM',
    keywords: ['statistics', 'variance', 'standard deviation', 'mean'],
  },
  {
    name: 'Probability & Bayes Theorem',
    classLevel: '12',
    unit: 'Combinatorics, Matrices & Probability',
    unitOrder: 2,
    weightage: 'HIGH',
    keywords: ['probability', 'bayes', 'random variable', 'bernoulli'],
  },
  {
    name: 'Straight Lines',
    classLevel: '11',
    unit: 'Coordinate Geometry',
    unitOrder: 3,
    weightage: 'MEDIUM',
    advWeightage: 'HIGH',
    keywords: ['straight line', 'slope', 'locus'],
  },
  {
    name: 'Circles & Conic Sections',
    classLevel: '11',
    unit: 'Coordinate Geometry',
    unitOrder: 3,
    weightage: 'HIGH',
    keywords: ['circle', 'parabola', 'ellipse', 'hyperbola', 'conic', 'tangent'],
  },
  {
    name: 'Relations, Functions & Inverse Trigonometry',
    classLevel: '12',
    unit: 'Differential Calculus',
    unitOrder: 4,
    weightage: 'MEDIUM',
    keywords: ['inverse trigonometry', 'itf', 'bijective', 'composite'],
  },
  {
    name: 'Limits & Derivatives',
    classLevel: '11',
    unit: 'Differential Calculus',
    unitOrder: 4,
    weightage: 'HIGH',
    keywords: ['limit', 'l hopital', 'derivative'],
  },
  {
    name: 'Continuity & Differentiability',
    classLevel: '12',
    unit: 'Differential Calculus',
    unitOrder: 4,
    weightage: 'HIGH',
    keywords: ['continuity', 'differentiability', 'rolle', 'lagrange'],
  },
  {
    name: 'Applications of Derivatives',
    classLevel: '12',
    unit: 'Differential Calculus',
    unitOrder: 4,
    weightage: 'HIGH',
    keywords: ['application of derivatives', 'aod', 'maxima', 'minima', 'monotonicity', 'normal'],
  },
  {
    name: 'Indefinite & Definite Integrals',
    classLevel: '12',
    unit: 'Integral Calculus & Differential Equations',
    unitOrder: 5,
    weightage: 'HIGH',
    keywords: ['integral', 'integration', 'definite', 'indefinite', 'king property'],
  },
  {
    name: 'Area Under Curves',
    classLevel: '12',
    unit: 'Integral Calculus & Differential Equations',
    unitOrder: 5,
    weightage: 'HIGH',
    keywords: ['area under', 'bounded region'],
  },
  {
    name: 'Differential Equations',
    classLevel: '12',
    unit: 'Integral Calculus & Differential Equations',
    unitOrder: 5,
    weightage: 'HIGH',
    keywords: ['differential equation', 'linear de', 'integrating factor'],
  },
  {
    name: 'Vector Algebra',
    classLevel: '12',
    unit: 'Vectors & 3D Geometry',
    unitOrder: 6,
    weightage: 'HIGH',
    keywords: ['vector', 'dot product', 'cross product', 'scalar triple'],
  },
  {
    name: 'Three Dimensional Geometry',
    classLevel: '12',
    unit: 'Vectors & 3D Geometry',
    unitOrder: 6,
    weightage: 'HIGH',
    keywords: ['3d', 'three dimensional', 'plane', 'skew lines', 'direction cosine'],
  },
];

const BIOLOGY_DEFS: RawChapterDef[] = [
  {
    name: 'Biological Classification & Diversity',
    classLevel: '11',
    unit: 'Diversity & Structural Organisation',
    unitOrder: 1,
    weightage: 'HIGH',
    keywords: ['biological classification', 'living world', 'monera', 'protista', 'fungi'],
  },
  {
    name: 'Plant Kingdom & Animal Kingdom',
    classLevel: '11',
    unit: 'Diversity & Structural Organisation',
    unitOrder: 1,
    weightage: 'HIGH',
    keywords: ['plant kingdom', 'animal kingdom', 'bryophyta', 'chordata', 'arthropoda'],
  },
  {
    name: 'Morphology & Anatomy of Flowering Plants',
    classLevel: '11',
    unit: 'Diversity & Structural Organisation',
    unitOrder: 1,
    weightage: 'HIGH',
    keywords: ['morphology', 'anatomy', 'flowering plants', 'vascular', 'placentation'],
  },
  {
    name: 'Structural Organisation in Animals',
    classLevel: '11',
    unit: 'Diversity & Structural Organisation',
    unitOrder: 1,
    weightage: 'MEDIUM',
    keywords: ['structural organisation', 'animal tissue', 'epithelium', 'frog', 'cockroach'],
  },
  {
    name: 'Cell: The Unit of Life & Cell Cycle',
    classLevel: '11',
    unit: 'Cell Biology & Biomolecules',
    unitOrder: 2,
    weightage: 'HIGH',
    keywords: ['cell cycle', 'mitosis', 'meiosis', 'organelle', 'unit of life'],
  },
  {
    name: 'Biomolecules',
    classLevel: '11',
    unit: 'Cell Biology & Biomolecules',
    unitOrder: 2,
    weightage: 'HIGH',
    keywords: ['biomolecules', 'enzyme', 'amino acid', 'polysaccharide'],
  },
  {
    name: 'Photosynthesis in Higher Plants',
    classLevel: '11',
    unit: 'Plant Physiology',
    unitOrder: 3,
    weightage: 'HIGH',
    keywords: ['photosynthesis', 'calvin', 'c4 pathway', 'chloroplast'],
  },
  {
    name: 'Respiration in Plants',
    classLevel: '11',
    unit: 'Plant Physiology',
    unitOrder: 3,
    weightage: 'MEDIUM',
    keywords: ['respiration', 'glycolysis', 'krebs', 'ets'],
  },
  {
    name: 'Plant Growth & Development',
    classLevel: '11',
    unit: 'Plant Physiology',
    unitOrder: 3,
    weightage: 'MEDIUM',
    keywords: ['plant growth', 'auxin', 'gibberellin', 'cytokinin', 'pgr'],
  },
  {
    name: 'Breathing & Exchange of Gases',
    classLevel: '11',
    unit: 'Human Physiology',
    unitOrder: 4,
    weightage: 'MEDIUM',
    keywords: ['breathing', 'respiratory', 'oxygen dissociation', 'alveoli'],
  },
  {
    name: 'Body Fluids & Circulation',
    classLevel: '11',
    unit: 'Human Physiology',
    unitOrder: 4,
    weightage: 'HIGH',
    keywords: ['circulation', 'cardiac', 'ecg', 'blood group', 'body fluids'],
  },
  {
    name: 'Excretory Products & Their Elimination',
    classLevel: '11',
    unit: 'Human Physiology',
    unitOrder: 4,
    weightage: 'MEDIUM',
    keywords: ['excretory', 'nephron', 'kidney', 'glomerular'],
  },
  {
    name: 'Locomotion & Movement',
    classLevel: '11',
    unit: 'Human Physiology',
    unitOrder: 4,
    weightage: 'MEDIUM',
    keywords: ['locomotion', 'muscle', 'sarcomere', 'skeletal', 'joint'],
  },
  {
    name: 'Neural & Chemical Coordination',
    classLevel: '11',
    unit: 'Human Physiology',
    unitOrder: 4,
    weightage: 'HIGH',
    keywords: ['neural', 'synapse', 'hormone', 'endocrine', 'pituitary'],
  },
  {
    name: 'Sexual Reproduction in Flowering Plants',
    classLevel: '12',
    unit: 'Reproduction, Genetics & Evolution',
    unitOrder: 5,
    weightage: 'HIGH',
    keywords: ['sexual reproduction in flowering', 'pollination', 'embryo sac', 'double fertilization'],
  },
  {
    name: 'Human Reproduction & Reproductive Health',
    classLevel: '12',
    unit: 'Reproduction, Genetics & Evolution',
    unitOrder: 5,
    weightage: 'HIGH',
    keywords: ['human reproduction', 'spermatogenesis', 'menstrual', 'reproductive health'],
  },
  {
    name: 'Principles of Inheritance & Variation',
    classLevel: '12',
    unit: 'Reproduction, Genetics & Evolution',
    unitOrder: 5,
    weightage: 'HIGH',
    keywords: ['inheritance', 'mendel', 'linkage', 'pedigree', 'genetic'],
  },
  {
    name: 'Molecular Basis of Inheritance',
    classLevel: '12',
    unit: 'Reproduction, Genetics & Evolution',
    unitOrder: 5,
    weightage: 'HIGH',
    keywords: ['molecular basis', 'dna', 'transcription', 'translation', 'lac operon'],
  },
  {
    name: 'Evolution',
    classLevel: '12',
    unit: 'Reproduction, Genetics & Evolution',
    unitOrder: 5,
    weightage: 'MEDIUM',
    keywords: ['evolution', 'hardy weinberg', 'natural selection', 'homologous'],
  },
  {
    name: 'Human Health & Disease',
    classLevel: '12',
    unit: 'Biology in Human Welfare & Biotechnology',
    unitOrder: 6,
    weightage: 'HIGH',
    keywords: ['health and disease', 'immunity', 'antibody', 'malaria', 'aids'],
  },
  {
    name: 'Microbes in Human Welfare',
    classLevel: '12',
    unit: 'Biology in Human Welfare & Biotechnology',
    unitOrder: 6,
    weightage: 'CORE',
    keywords: ['microbes', 'sewage', 'biogas', 'biofertilizer'],
  },
  {
    name: 'Biotechnology: Principles & Processes',
    classLevel: '12',
    unit: 'Biology in Human Welfare & Biotechnology',
    unitOrder: 6,
    weightage: 'HIGH',
    keywords: ['biotechnology: principles', 'pcr', 'restriction enzyme', 'plasmid', 'pbr322'],
  },
  {
    name: 'Biotechnology & Its Applications',
    classLevel: '12',
    unit: 'Biology in Human Welfare & Biotechnology',
    unitOrder: 6,
    weightage: 'HIGH',
    keywords: ['biotechnology & its applications', 'bt cotton', 'rnai', 'gene therapy'],
  },
  {
    name: 'Organisms, Populations & Ecosystems',
    classLevel: '12',
    unit: 'Ecology & Environment',
    unitOrder: 7,
    weightage: 'HIGH',
    keywords: ['ecosystem', 'population', 'ecological pyramid', 'mutualism', 'productivity'],
  },
  {
    name: 'Biodiversity & Conservation',
    classLevel: '12',
    unit: 'Ecology & Environment',
    unitOrder: 7,
    weightage: 'MEDIUM',
    keywords: ['biodiversity', 'conservation', 'red data', 'hotspot', 'species-area'],
  },
];

const SUBJECT_DEFS: Record<SubjectType, RawChapterDef[]> = {
  Physics: PHYSICS_DEFS,
  Chemistry: CHEMISTRY_DEFS,
  Mathematics: MATHEMATICS_DEFS,
  Biology: BIOLOGY_DEFS,
};

function resolveWeightage(def: RawChapterDef, exam: ExamType): ChapterWeightage {
  if (exam === 'NEET' && def.neetWeightage) return def.neetWeightage;
  if (exam === 'JEE_ADV' && def.advWeightage) return def.advWeightage;
  return def.weightage;
}

function hydrateChapter(
  subject: SubjectType,
  def: RawChapterDef,
  exam: ExamType
): SyllabusChapter {
  const baseKeyword = def.name.toLowerCase();
  const keywords = Array.from(
    new Set([baseKeyword, ...(def.keywords || []).map((k) => k.toLowerCase())])
  );
  return {
    key: getChapterKey(subject, def.classLevel, def.name),
    name: def.name,
    classLevel: def.classLevel,
    subject,
    unit: def.unit,
    unitOrder: def.unitOrder,
    weightage: resolveWeightage(def, exam),
    keywords,
  };
}

export function getChaptersForSelection(
  exam: ExamType,
  subject: SubjectType,
  classes: ClassLevel[]
): SyllabusChapter[] {
  if (exam === 'NEET' && subject === 'Mathematics') return [];
  if (exam !== 'NEET' && subject === 'Biology') return [];

  const activeClasses: ClassLevel[] = classes.length > 0 ? classes : ['11', '12'];
  const defs = SUBJECT_DEFS[subject] || [];
  return defs
    .filter((def) => activeClasses.includes(def.classLevel))
    .map((def) => hydrateChapter(subject, def, exam));
}

export function getStructuredCurriculum(exam: ExamType): RoadmapSubjectCurriculum[] {
  const subjects = getSubjectsForExam(exam);
  return subjects.map((subject) => {
    const defs = SUBJECT_DEFS[subject] || [];
    const hydrated = defs.map((def) => hydrateChapter(subject, def, exam));
    const unitMap = new Map<string, RoadmapUnit>();

    for (const ch of hydrated) {
      const existing = unitMap.get(ch.unit);
      if (existing) {
        existing.chapters.push(ch);
      } else {
        unitMap.set(ch.unit, {
          unit: ch.unit,
          unitOrder: ch.unitOrder,
          chapters: [ch],
        });
      }
    }

    const units = Array.from(unitMap.values()).sort((a, b) => a.unitOrder - b.unitOrder);
    return {
      subject,
      units,
      chapters: hydrated,
    };
  });
}

export function matchesSyllabusChapter(rawTopic: string | undefined, chapter: SyllabusChapter): boolean {
  const normalized = String(rawTopic || '').toLowerCase().trim();
  if (!normalized || normalized === 'all' || normalized === 'all topics' || normalized === 'general pyq') {
    return false;
  }
  if (normalized === chapter.name.toLowerCase()) return true;
  return chapter.keywords.some((kw) => kw.length >= 3 && normalized.includes(kw));
}

export const SYLLABUS_CATALOG: SyllabusChapter[] = [
  ...(SUBJECT_DEFS.Physics || []).map((d) => hydrateChapter('Physics', d, 'JEE_MAINS')),
  ...(SUBJECT_DEFS.Chemistry || []).map((d) => hydrateChapter('Chemistry', d, 'JEE_MAINS')),
  ...(SUBJECT_DEFS.Mathematics || []).map((d) => hydrateChapter('Mathematics', d, 'JEE_MAINS')),
];
