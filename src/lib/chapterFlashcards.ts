import type { SubjectType } from '../types/obren';

export interface FlashcardItem {
  id: string;
  title: string;
  formula: string;
  tip: string;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
}

interface FlashcardMatchRule {
  keywords: string[];
  cards: FlashcardItem[];
}

const PHYSICS_CARDS: FlashcardMatchRule[] = [
  {
    keywords: ['kinematics', 'projectile', 'motion in'],
    cards: [
      {
        id: 'kin-1',
        title: 'Projectile Range & Max Height',
        formula: '$R = \\frac{u^2 \\sin 2\\theta}{g},\\quad H_{\\max} = \\frac{u^2 \\sin^2\\theta}{2g},\\quad \\frac{H}{R} = \\frac{\\tan\\theta}{4}$',
        tip: 'Maximum range occurs at $\\theta = 45^\\circ$, and complementary angles $(\\theta, 90^\\circ - \\theta)$ yield identical horizontal ranges.',
      },
      {
        id: 'kin-2',
        title: 'Trajectory Equation & Curvature',
        formula: '$y = x\\tan\\theta - \\frac{gx^2}{2u^2\\cos^2\\theta} = x\\tan\\theta\\left(1 - \\frac{x}{R}\\right)$',
        tip: 'Radius of curvature at the peak is simply $R_c = \\frac{(u\\cos\\theta)^2}{g}$.',
      },
    ],
  },
  {
    keywords: ['laws of motion', 'friction', 'circular'],
    cards: [
      {
        id: 'nlm-1',
        title: 'Limiting Friction & Angle of Repose',
        formula: '$f_{\\max} = \\mu_s N,\\quad \\tan\\theta_r = \\mu_s,\\quad v_{\\text{safe}} = \\sqrt{Rg\\frac{\\mu + \\tan\\theta}{1 - \\mu\\tan\\theta}}$',
        tip: 'Always check if applied force exceeds $\\mu_s N$ before switching to kinetic friction $\\mu_k N$.',
      },
    ],
  },
  {
    keywords: ['work', 'energy', 'power'],
    cards: [
      {
        id: 'wep-1',
        title: 'Work-Energy Theorem & Vertical Circle',
        formula: '$W_{\\text{all}} = \\Delta K,\\quad v_{\\text{bottom, min}} = \\sqrt{5gL},\\quad v_{\\text{top, min}} = \\sqrt{gL}$',
        tip: 'Tension difference between bottom and top of a taut string vertical circle is always $T_B - T_T = 6mg$.',
      },
    ],
  },
  {
    keywords: ['rotational', 'torque', 'moment of inertia', 'rolling'],
    cards: [
      {
        id: 'rot-1',
        title: 'Pure Rolling Acceleration Down Incline',
        formula: '$a = \\frac{g\\sin\\theta}{1 + \\frac{k^2}{R^2}},\\quad f_{\\text{req}} = \\frac{mg\\sin\\theta}{1 + \\frac{R^2}{k^2}}$',
        tip: 'Values of $k^2/R^2$: Solid sphere $= 2/5$, Hollow sphere $= 2/3$, Solid cylinder/disc $= 1/2$, Ring $= 1$.',
      },
      {
        id: 'rot-2',
        title: 'Parallel & Perpendicular Axes Theorems',
        formula: '$I = I_{\\text{cm}} + Md^2,\\qquad I_z = I_x + I_y\\text{ (planar lamina)}$',
        tip: '$I_{\\text{cm}}$ must pass through the actual center of mass of the rigid body.',
      },
    ],
  },
  {
    keywords: ['gravitation', 'kepler', 'satellite'],
    cards: [
      {
        id: 'grav-1',
        title: 'Orbital & Escape Velocities',
        formula: '$v_o = \\sqrt{\\frac{GM}{r}},\\quad v_e = \\sqrt{\\frac{2GM}{R}} = \\sqrt{2}\\,v_{o,\\text{surface}},\\quad E_{\\text{total}} = -\\frac{GMm}{2r}$',
        tip: 'Binding energy of a satellite at radius $r$ is $+\\frac{GMm}{2r} = K = -\\frac{1}{2}U$.',
      },
    ],
  },
  {
    keywords: ['thermodynamics', 'thermal', 'kinetic theory', 'ktg'],
    cards: [
      {
        id: 'thermo-1',
        title: 'Polytropic & Adiabatic Gas Laws',
        formula: '$PV^\\gamma = \\text{const},\\quad W = \\frac{nR(T_1 - T_2)}{\\gamma - 1},\\quad \\eta_{\\text{Carnot}} = 1 - \\frac{T_C}{T_H}$',
        tip: 'Degrees of freedom $f$: monatomic $= 3$, linear/diatomic $= 5$ (at 300K), non-linear polyatomic $= 6$; $\\gamma = 1 + 2/f$.',
      },
    ],
  },
  {
    keywords: ['electrostatics', 'gauss', 'capacitance', 'potential'],
    cards: [
      {
        id: 'elec-1',
        title: 'Gauss Law & Capacitor Energy',
        formula: '$\\oint \\vec{E}\\cdot d\\vec{A} = \\frac{q_{\\text{enc}}}{\\varepsilon_0},\\quad C = \\frac{K\\varepsilon_0 A}{d},\\quad U = \\frac{1}{2}CV^2 = \\frac{Q^2}{2C}$',
        tip: 'Inserting a dielectric $K$ with battery disconnected keeps $Q$ fixed ($V \\to V/K$, $U \\to U/K$); with battery connected keeps $V$ fixed ($U \\to KU$).',
      },
    ],
  },
  {
    keywords: ['current electricity', 'kirchhoff', 'resistor'],
    cards: [
      {
        id: 'curr-1',
        title: 'Drift Velocity & Cell Grouping',
        formula: '$I = n e A v_d,\\quad R = \\rho\\frac{L}{A},\\quad E_{\\text{eq}} = \\frac{\\sum (E_i/r_i)}{\\sum (1/r_i)}$',
        tip: 'Maximum power transfer to external load $R$ happens when $R = r_{\\text{internal}}$ ($P_{\\max} = E^2/(4r)$).',
      },
    ],
  },
  {
    keywords: ['magnetism', 'electromagnetic induction', 'alternating current', 'emi', 'lcr'],
    cards: [
      {
        id: 'mag-1',
        title: 'Lorentz Force, Motional EMF & LCR Resonance',
        formula: '$r = \\frac{mv}{qB},\\quad |\\varepsilon| = Blv,\\quad Z = \\sqrt{R^2 + (X_L - X_C)^2},\\quad f_0 = \\frac{1}{2\\pi\\sqrt{LC}}$',
        tip: 'Average power in AC circuit is $P_{\\text{avg}} = V_{\\text{rms}} I_{\\text{rms}} \\cos\\phi$ where $\\cos\\phi = R/Z$.',
      },
    ],
  },
  {
    keywords: ['optics', 'ray optics', 'wave optics', 'ydse', 'lens'],
    cards: [
      {
        id: 'opt-1',
        title: 'Lensmaker Formula & YDSE Fringe Width',
        formula: '$\\frac{1}{f} = (\\mu - 1)\\left(\\frac{1}{R_1} - \\frac{1}{R_2}\\right),\\qquad \\beta = \\frac{\\lambda D}{d}$',
        tip: 'Putting a slab of thickness $t$ and index $\\mu$ in one YDSE slit shifts fringes by $\\Delta y = \\frac{(\\mu - 1)tD}{d}$.',
      },
    ],
  },
  {
    keywords: ['dual nature', 'atoms', 'nuclei', 'semiconductor', 'modern'],
    cards: [
      {
        id: 'mod-1',
        title: 'Photoelectric, de Broglie & Bohr Atom',
        formula: '$eV_0 = \\frac{hc}{\\lambda} - \\phi_0,\\quad \\lambda = \\frac{h}{\\sqrt{2mK}},\\quad E_n = -13.6\\frac{Z^2}{n^2}\\text{ eV}$',
        tip: 'Useful shortcut: $hc \\approx 1240\\text{ eV}\\cdot\\text{nm}$ and $\\lambda_e \\approx \\frac{12.27}{\\sqrt{V}}\\text{ \\AA}$.',
      },
    ],
  },
];

const CHEMISTRY_CARDS: FlashcardMatchRule[] = [
  {
    keywords: ['mole', 'stoichiometry', 'solutions', 'colligative'],
    cards: [
      {
        id: 'chem-sol-1',
        title: 'Colligative Properties with van ’t Hoff Factor',
        formula: '$\\Delta T_b = i K_b m,\\quad \\Delta T_f = i K_f m,\\quad \\Pi = iCRT$',
        tip: 'For dissociation into $n$ ions with degree $\\alpha$: $i = 1 + (n - 1)\\alpha$.',
      },
    ],
  },
  {
    keywords: ['atom', 'atomic', 'bonding', 'coordination'],
    cards: [
      {
        id: 'chem-bond-1',
        title: 'CFSE & Spin-Only Magnetic Moment',
        formula: '$\\mu = \\sqrt{n(n + 2)}\\text{ BM},\\qquad \\text{BO} = \\frac{N_b - N_a}{2}$',
        tip: 'Strong-field ligands ($CN^-, CO, en, NH_3$ mostly) pair electrons ($\Delta_o > P$); $H_2O$ and halides are generally weak-field.',
      },
    ],
  },
  {
    keywords: ['thermodynamics', 'equilibrium', 'electrochemistry', 'kinetics'],
    cards: [
      {
        id: 'chem-phys-1',
        title: 'Gibbs, Nernst & First-Order Kinetics',
        formula: '$\\Delta G^\\circ = -nFE^\\circ_{\\text{cell}} = -RT\\ln K,\\quad E = E^\\circ - \\frac{0.0591}{n}\\log Q,\\quad k = \\frac{2.303}{t}\\log\\frac{[A]_0}{[A]_t}$',
        tip: 'First-order half-life $t_{1/2} = \\frac{0.693}{k}$ is completely independent of initial concentration.',
      },
    ],
  },
  {
    keywords: ['goc', 'hydrocarbon', 'haloalkane', 'alcohol', 'aldehyde', 'ketone', 'amine', 'biomolecules'],
    cards: [
      {
        id: 'chem-org-1',
        title: 'Key Organic Stability & Named Tests',
        formula: 'Carbocation stability: $3^\\circ > 2^\\circ > 1^\\circ > CH_3^+$; Tollens ($[Ag(NH_3)_2]^+$) oxidizes aldehydes only.',
        tip: 'Basicity in aqueous solution: $(C_2H_5)_2NH > (C_2H_5)_3N > C_2H_5NH_2 > NH_3$, whereas for methyl it is $(CH_3)_2NH > CH_3NH_2 > (CH_3)_3N > NH_3$.',
      },
    ],
  },
];

const MATHS_CARDS: FlashcardMatchRule[] = [
  {
    keywords: ['complex', 'quadratic', 'sequence', 'series', 'binomial'],
    cards: [
      {
        id: 'math-alg-1',
        title: 'Cube Roots of Unity & General Binomial Term',
        formula: '$1 + \\omega + \\omega^2 = 0,\\; \\omega^3 = 1,\\qquad T_{r+1} = \\binom{n}{r} x^{n-r} y^r$',
        tip: 'For $ax^2+bx+c=0$, remember $D = b^2 - 4ac$ and AM $\\ge$ GM $\\ge$ HM for positive reals.',
      },
    ],
  },
  {
    keywords: ['matrix', 'matrices', 'determinant', 'probability', 'permutation'],
    cards: [
      {
        id: 'math-mat-1',
        title: 'Adjoint, Bayes Theorem & Permutations',
        formula: '$A(\\text{adj }A) = |A|I,\\quad |\\text{adj }A| = |A|^{n-1},\\quad P(A|B) = \\frac{P(B|A)P(A)}{\\sum P(B|A_i)P(A_i)}$',
        tip: 'Number of derangements of $n$ distinct items: $D_n = n!\\sum_{k=0}^{n} \\frac{(-1)^k}{k!}$.',
      },
    ],
  },
  {
    keywords: ['line', 'circle', 'conic', 'parabola', 'ellipse', 'hyperbola'],
    cards: [
      {
        id: 'math-coord-1',
        title: 'Tangent Condition & Eccentricity',
        formula: 'Parabola $y = mx + \\frac{a}{m}$; Ellipse $y = mx \\pm \\sqrt{a^2m^2 + b^2}$; $c^2 = a^2(1 - e^2)$',
        tip: 'Equation of chord with midpoint $(x_1, y_1)$ for any conic is always $T = S_1$.',
      },
    ],
  },
  {
    keywords: ['limit', 'continuity', 'derivative', 'integral', 'area', 'differential'],
    cards: [
      {
        id: 'math-calc-1',
        title: 'Definite Integrals & Linear Differential Equation',
        formula: '$\\int_a^b f(x)dx = \\int_a^b f(a+b-x)dx,\\qquad \\frac{dy}{dx} + Py = Q \\implies y\\cdot e^{\\int Pdx} = \\int Q\\,e^{\\int Pdx}dx$',
        tip: 'Always check Leibniz rule when differentiating under an integral with variable limits: $\\frac{d}{dx}\\int_{g(x)}^{h(x)} f(t)dt$.',
      },
    ],
  },
  {
    keywords: ['vector', '3d', 'three dimensional'],
    cards: [
      {
        id: 'math-vec-1',
        title: 'Scalar Triple & Shortest Skew Line Distance',
        formula: '$\\vec{a}\\times(\\vec{b}\\times\\vec{c}) = (\\vec{a}\\cdot\\vec{c})\\vec{b} - (\\vec{a}\\cdot\\vec{b})\\vec{c},\\qquad d = \\frac{|(\\vec{a}_2 - \\vec{a}_1)\\cdot(\\vec{b}_1\\times\\vec{b}_2)|}{|\\vec{b}_1\\times\\vec{b}_2|}$',
        tip: 'Three vectors are coplanar iff their scalar triple product $[\\vec{a}\\;\\vec{b}\\;\\vec{c}] = 0$.',
      },
    ],
  },
];

const BIOLOGY_CARDS: FlashcardMatchRule[] = [
  {
    keywords: ['cell', 'biomolecules', 'classification', 'kingdom', 'morphology'],
    cards: [
      {
        id: 'bio-cell-1',
        title: 'Meiosis Checkpoints & Ploidy Tracking',
        formula: 'S-phase: DNA doubles ($2C \\to 4C$), chromosome number stays $2n$; Anaphase I halves chromosome count ($2n \\to n$).',
        tip: 'Pachytene = recombination nodules; Diakinesis = terminalization of chiasmata.',
      },
    ],
  },
  {
    keywords: ['photosynthesis', 'respiration', 'growth', 'breathing', 'circulation', 'excretory', 'neural', 'locomotion'],
    cards: [
      {
        id: 'bio-phys-1',
        title: 'Photosynthesis ATP/NADPH & Cardiac Output',
        formula: 'C3 fixation per glucose: $18\\text{ ATP} + 12\\text{ NADPH}$; Cardiac Output $= \\text{Stroke Volume} \\times \\text{Heart Rate} \\approx 5\\text{ L/min}$',
        tip: 'RuBisCO shows oxygenase activity under high $O_2$/high temperature in C3 plants; C4 plants bypass photorespiration via Kranz anatomy.',
      },
    ],
  },
  {
    keywords: ['inheritance', 'molecular', 'reproduction', 'evolution', 'biotechnology', 'ecosystem', 'biodiversity', 'health', 'microbes'],
    cards: [
      {
        id: 'bio-gen-1',
        title: 'Hardy-Weinberg & Biotechnology Vectors',
        formula: '$p + q = 1,\\quad p^2 + 2pq + q^2 = 1$;\\quad pBR322 has $amp^R$, $tet^R$, $ori$, and $rop$ markers.',
        tip: 'In insertional inactivation at $Bam\\text{HI}$ inside $tet^R$, recombinants grow on ampicillin but NOT tetracycline.',
      },
    ],
  },
];

const SUBJECT_RULES: Record<SubjectType, FlashcardMatchRule[]> = {
  Physics: PHYSICS_CARDS,
  Chemistry: CHEMISTRY_CARDS,
  Mathematics: MATHS_CARDS,
  Biology: BIOLOGY_CARDS,
};

export function getFlashcardsForChapter(subject: SubjectType, chapterName: string): FlashcardItem[] {
  const lower = chapterName.toLowerCase();
  const rules = SUBJECT_RULES[subject] || [];
  const matched: FlashcardItem[] = [];

  for (const rule of rules) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      matched.push(...rule.cards);
    }
  }

  if (matched.length > 0) {
    return matched;
  }

  // Fallback high-yield revision cards tailored to the subject + chapter name
  return [
    {
      id: `gen-1-${subject}`,
      title: `${chapterName} — Active Recall Prompt`,
      formula: `List the 3 governing equations / exceptions for ${chapterName}, verify SI units & limiting cases ($x \\to 0,\\; x \\to \\infty$).`,
      tip: 'Before solving PYQs, write down boundary conditions and standard values from NCERT without looking at notes.',
    },
    {
      id: `gen-2-${subject}`,
      title: `${chapterName} — High-Frequency Trap Check`,
      formula: 'Sign conventions, significant figures, and temperature/concentration assumptions.',
      tip: 'Flag missed derivations into your Error Notebook after attempting a 10-question drill on this chapter.',
    },
  ];
}
