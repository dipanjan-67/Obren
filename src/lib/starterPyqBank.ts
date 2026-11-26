import { collection, doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import type { DifficultyLevel, ExamType, PyqQuestion, QuestionType, SubjectType } from '../types/obren';

export interface StarterSeedQuestion {
  exam: ExamType;
  classLevel: '11' | '12';
  subject: SubjectType;
  topic: string;
  year: string;
  questionType: QuestionType;
  prompt: string;
  options: string[];
  correctAnswer: string;
  solution: string;
  difficulty: DifficultyLevel;
}

export const STARTER_PYQ_SEEDS: StarterSeedQuestion[] = [
  // JEE MAINS — PHYSICS
  {
    exam: 'JEE_MAINS',
    classLevel: '11',
    subject: 'Physics',
    topic: 'Kinematics (Motion in 1D & 2D)',
    year: 'JEE Main 2024',
    questionType: 'MCQ',
    prompt:
      'A projectile is launched with speed $20\\text{ m/s}$ at an angle of $60^\\circ$ with the horizontal. What is the radius of curvature of its trajectory at the highest point? (Take $g = 10\\text{ m/s}^2$)',
    options: ['10 m', '20 m', '5 m', '40 m'],
    correctAnswer: '10 m',
    solution:
      'At the highest point, speed $v = u\\cos 60^\\circ = 20 \\times 0.5 = 10\\text{ m/s}$ and normal acceleration $a_n = g = 10\\text{ m/s}^2$. Hence $R = \\frac{v^2}{g} = \\frac{10^2}{10} = 10\\text{ m}$.',
    difficulty: 'MEDIUM',
  },
  {
    exam: 'JEE_MAINS',
    classLevel: '11',
    subject: 'Physics',
    topic: 'Rotational Motion',
    year: 'JEE Main 2023',
    questionType: 'MCQ',
    prompt:
      'A solid sphere of mass $M$ and radius $R$ rolls without slipping down an inclined plane of inclination $30^\\circ$. Its linear acceleration down the plane is:',
    options: ['$\\frac{5}{14}g$', '$\\frac{1}{2}g$', '$\\frac{2}{7}g$', '$\\frac{5}{7}g$'],
    correctAnswer: '$\\frac{5}{14}g$',
    solution:
      'For rolling without slipping, $a = \\frac{g\\sin\\theta}{1 + I/(MR^2)}$. For a solid sphere $I = \\frac{2}{5}MR^2$, so $a = \\frac{g\\sin 30^\\circ}{1 + 2/5} = \\frac{g/2}{7/5} = \\frac{5}{14}g$.',
    difficulty: 'MEDIUM',
  },
  {
    exam: 'JEE_MAINS',
    classLevel: '12',
    subject: 'Physics',
    topic: 'Electrostatics & Gauss Law',
    year: 'JEE Main 2024',
    questionType: 'NUMERICAL',
    prompt:
      'An electric dipole with dipole moment $p = 4 \\times 10^{-9}\\text{ C}\\cdot\\text{m}$ is aligned at $30^\\circ$ with a uniform electric field of magnitude $5 \\times 10^4\\text{ N/C}$. Find the magnitude of torque acting on the dipole in units of $10^{-4}\\text{ N}\\cdot\\text{m}$.',
    options: [],
    correctAnswer: '1',
    solution:
      '$\\tau = pE\\sin\\theta = (4 \\times 10^{-9})(5 \\times 10^4)\\sin 30^\\circ = 2 \\times 10^{-4} \\times 0.5 = 1 \\times 10^{-4}\\text{ N}\\cdot\\text{m}$.',
    difficulty: 'EASY',
  },
  {
    exam: 'JEE_MAINS',
    classLevel: '12',
    subject: 'Physics',
    topic: 'Current Electricity',
    year: 'JEE Main 2023',
    questionType: 'MCQ',
    prompt:
      'A wire of resistance $16\\,\\Omega$ is melted and stretched uniformly to twice its original length. The new resistance of the wire is:',
    options: ['64 Ω', '32 Ω', '8 Ω', '4 Ω'],
    correctAnswer: '64 Ω',
    solution:
      'Since volume $V = A L$ stays constant, doubling $L$ halves cross-section $A$, so $R \\propto L^2$. Therefore $R_{\\text{new}} = 16 \\times 2^2 = 64\\,\\Omega$.',
    difficulty: 'EASY',
  },
  {
    exam: 'JEE_MAINS',
    classLevel: '12',
    subject: 'Physics',
    topic: 'Dual Nature of Radiation & Matter',
    year: 'JEE Main 2024',
    questionType: 'NUMERICAL',
    prompt:
      'Photons of energy $4.5\\text{ eV}$ strike a metal surface having work function $2.0\\text{ eV}$. What is the stopping potential (in Volts)?',
    options: [],
    correctAnswer: '2.5',
    solution:
      'By Einstein photoelectric equation, $e V_0 = h\\nu - \\phi_0 = 4.5 - 2.0 = 2.5\\text{ eV}$, hence stopping potential $V_0 = 2.5\\text{ V}$.',
    difficulty: 'EASY',
  },

  // JEE MAINS — CHEMISTRY
  {
    exam: 'JEE_MAINS',
    classLevel: '11',
    subject: 'Chemistry',
    topic: 'Chemical & Ionic Equilibrium',
    year: 'JEE Main 2024',
    questionType: 'MCQ',
    prompt:
      'For the gas-phase reaction $N_2(g) + 3H_2(g) \\rightleftharpoons 2NH_3(g)$, the relation between $K_p$ and $K_c$ is:',
    options: ['$K_p = K_c(RT)^{-2}$', '$K_p = K_c(RT)^2$', '$K_p = K_c(RT)^{-1}$', '$K_p = K_c$'],
    correctAnswer: '$K_p = K_c(RT)^{-2}$',
    solution:
      '$\\Delta n_g = n_{\\text{products}} - n_{\\text{reactants}} = 2 - (1 + 3) = -2$. Using $K_p = K_c(RT)^{\\Delta n_g}$, we get $K_p = K_c(RT)^{-2}$.',
    difficulty: 'EASY',
  },
  {
    exam: 'JEE_MAINS',
    classLevel: '11',
    subject: 'Chemistry',
    topic: 'Chemical Bonding & Molecular Structure',
    year: 'JEE Main 2023',
    questionType: 'MCQ',
    prompt: 'Among the following species, which one has a square planar geometry?',
    options: ['$[Ni(CN)_4]^{2-}$', '$[NiCl_4]^{2-}$', '$[FeCl_4]^-$', '$SF_4$'],
    correctAnswer: '$[Ni(CN)_4]^{2-}$',
    solution:
      'In $[Ni(CN)_4]^{2-}$, $Ni^{2+}$ ($d^8$) pairs its electrons due to the strong-field $CN^-$ ligand, giving $dsp^2$ hybridization and square planar geometry.',
    difficulty: 'MEDIUM',
  },
  {
    exam: 'JEE_MAINS',
    classLevel: '12',
    subject: 'Chemistry',
    topic: 'Chemical Kinetics',
    year: 'JEE Main 2024',
    questionType: 'NUMERICAL',
    prompt:
      'A first-order reaction is $75\\%$ complete in $40\\text{ minutes}$. Find its half-life (in minutes).',
    options: [],
    correctAnswer: '20',
    solution:
      '$75\\%$ completion corresponds to two half-lives ($100\\% \\to 50\\% \\to 25\\%$). Thus $2 t_{1/2} = 40\\text{ min} \\Rightarrow t_{1/2} = 20\\text{ min}$.',
    difficulty: 'EASY',
  },
  {
    exam: 'JEE_MAINS',
    classLevel: '12',
    subject: 'Chemistry',
    topic: 'Aldehydes, Ketones & Carboxylic Acids',
    year: 'JEE Main 2023',
    questionType: 'MCQ',
    prompt: 'Which of the following aldehydes undergoes Cannizzaro reaction on treatment with concentrated $NaOH$?',
    options: ['Benzaldehyde', 'Acetaldehyde', 'Propanal', 'Phenylacetaldehyde'],
    correctAnswer: 'Benzaldehyde',
    solution:
      'Cannizzaro reaction occurs with aldehydes lacking $\\alpha$-hydrogen atoms. Benzaldehyde ($C_6H_5CHO$) has no $\\alpha$-H and disproportionates in conc. $NaOH$.',
    difficulty: 'MEDIUM',
  },

  // JEE MAINS — MATHEMATICS
  {
    exam: 'JEE_MAINS',
    classLevel: '11',
    subject: 'Mathematics',
    topic: 'Complex Numbers & Quadratic Equations',
    year: 'JEE Main 2024',
    questionType: 'MCQ',
    prompt: 'If $\\alpha$ and $\\beta$ are roots of $x^2 - 5x + 3 = 0$, find the value of $\\alpha^2 + \\beta^2$.',
    options: ['19', '25', '22', '31'],
    correctAnswer: '19',
    solution:
      '$\\alpha + \\beta = 5$ and $\\alpha\\beta = 3$. Hence $\\alpha^2 + \\beta^2 = (\\alpha + \\beta)^2 - 2\\alpha\\beta = 25 - 6 = 19$.',
    difficulty: 'EASY',
  },
  {
    exam: 'JEE_MAINS',
    classLevel: '12',
    subject: 'Mathematics',
    topic: 'Indefinite & Definite Integrals',
    year: 'JEE Main 2024',
    questionType: 'MCQ',
    prompt: 'Evaluate the definite integral $I = \\int_{0}^{\\pi/2} \\frac{\\sin x}{\\sin x + \\cos x}\\,dx$.',
    options: ['$\\frac{\\pi}{4}$', '$\\frac{\\pi}{2}$', '$\\frac{\\pi}{3}$', '$\\frac{\\pi}{6}$'],
    correctAnswer: '$\\frac{\\pi}{4}$',
    solution:
      'Using King property $\\int_0^a f(x)dx = \\int_0^a f(a-x)dx$, adding $I + I = \\int_0^{\\pi/2} 1\\,dx = \\frac{\\pi}{2}$, so $I = \\frac{\\pi}{4}$.',
    difficulty: 'EASY',
  },
  {
    exam: 'JEE_MAINS',
    classLevel: '12',
    subject: 'Mathematics',
    topic: 'Matrices & Determinants',
    year: 'JEE Main 2023',
    questionType: 'NUMERICAL',
    prompt:
      'If $A$ is a $3 \\times 3$ non-singular matrix such that $|A| = 4$, find the value of $|\\text{adj}(A)|$.',
    options: [],
    correctAnswer: '16',
    solution:
      'For an $n \\times n$ matrix, $|\\text{adj}(A)| = |A|^{n-1}$. Here $n = 3$ and $|A| = 4$, so $|\\text{adj}(A)| = 4^{3-1} = 16$.',
    difficulty: 'EASY',
  },
  {
    exam: 'JEE_MAINS',
    classLevel: '12',
    subject: 'Mathematics',
    topic: 'Vector Algebra',
    year: 'JEE Main 2024',
    questionType: 'NUMERICAL',
    prompt:
      'If $\\vec{a} = \\hat{i} + 2\\hat{j} - \\hat{k}$ and $\\vec{b} = 3\\hat{i} - \\hat{j} + 2\\hat{k}$, compute the magnitude of $\\vec{a} \\cdot \\vec{b}$.',
    options: [],
    correctAnswer: '1',
    solution: '$\\vec{a}\\cdot\\vec{b} = 1(3) + 2(-1) + (-1)(2) = 3 - 2 - 2 = -1$, so $|\\vec{a}\\cdot\\vec{b}| = 1$.',
    difficulty: 'EASY',
  },

  // JEE ADVANCED — MULTI_MCQ + NUMERICAL + HARD
  {
    exam: 'JEE_ADV',
    classLevel: '11',
    subject: 'Physics',
    topic: 'Thermal Properties & Thermodynamics',
    year: 'JEE Adv 2023',
    questionType: 'MULTI_MCQ',
    prompt:
      'One mole of an ideal monatomic gas undergoes a reversible isothermal expansion from volume $V_0$ to $2V_0$ at temperature $T_0$. Which of the following statements is/are CORRECT?',
    options: [
      'Change in internal energy $\\Delta U = 0$',
      'Work done by the gas is $RT_0\\ln 2$',
      'Heat absorbed by the gas equals $RT_0\\ln 2$',
      'Molar heat capacity in this process is $3R/2$',
    ],
    correctAnswer: 'Change in internal energy $\\Delta U = 0$, Work done by the gas is $RT_0\\ln 2$, Heat absorbed by the gas equals $RT_0\\ln 2$',
    solution:
      'For an ideal gas in an isothermal process, $T$ is constant so $\\Delta U = 0$. From the First Law, $Q = W = nRT_0\\ln(V_2/V_1) = RT_0\\ln 2$. Isothermal molar heat capacity is infinite, not $3R/2$.',
    difficulty: 'HARD',
  },
  {
    exam: 'JEE_ADV',
    classLevel: '12',
    subject: 'Chemistry',
    topic: 'Electrochemistry',
    year: 'JEE Adv 2022',
    questionType: 'MULTI_MCQ',
    prompt:
      'Regarding a Daniell cell $\\text{Zn}(s)\\,|\\,\\text{Zn}^{2+}(aq)\\,||\\,\\text{Cu}^{2+}(aq)\\,|\\,\\text{Cu}(s)$ at $298\\text{ K}$ ($E^\\circ_{\\text{cell}} = 1.10\\text{ V}$), select the CORRECT statement(s):',
    options: [
      'Electrons flow from Zn anode to Cu cathode in external circuit',
      'Cell EMF increases when $[\\text{Cu}^{2+}]$ is increased',
      '$\\Delta G^\\circ$ for the cell reaction is negative',
      'Cations from the salt bridge migrate toward the anode',
    ],
    correctAnswer: 'Electrons flow from Zn anode to Cu cathode in external circuit, Cell EMF increases when $[\\text{Cu}^{2+}]$ is increased, $\\Delta G^\\circ$ for the cell reaction is negative',
    solution:
      'Zn is oxidized at anode so electrons flow Zn $\\to$ Cu externally; $E = E^\\circ - \\frac{0.059}{2}\\log\\frac{[Zn^{2+}]}{[Cu^{2+}]}$ rises with $[Cu^{2+}]$; spontaneous cell has $\\Delta G^\\circ < 0$; cations in salt bridge move toward the cathode.',
    difficulty: 'MEDIUM',
  },
  {
    exam: 'JEE_ADV',
    classLevel: '12',
    subject: 'Mathematics',
    topic: 'Continuity & Differentiability',
    year: 'JEE Adv 2023',
    questionType: 'NUMERICAL',
    prompt:
      'Let $f(x) = x^3 - 3x^2 + 3x + 7$. Find the number of points in $\\mathbb{R}$ where $f(x)$ attains a local extremum.',
    options: [],
    correctAnswer: '0',
    solution:
      '$f\'(x) = 3x^2 - 6x + 3 = 3(x - 1)^2 \\ge 0$ for all $x \\in \\mathbb{R}$. Since $f\'(x)$ does not change sign at $x=1$, there are $0$ local extrema.',
    difficulty: 'MEDIUM',
  },

  // NEET UG — PHYSICS, CHEMISTRY, BIOLOGY
  {
    exam: 'NEET',
    classLevel: '11',
    subject: 'Biology',
    topic: 'Cell: The Unit of Life & Cell Cycle',
    year: 'NEET 2024',
    questionType: 'MCQ',
    prompt: 'During meiosis I, crossing over between non-sister chromatids of homologous chromosomes occurs at:',
    options: ['Pachytene', 'Zygotene', 'Diplotene', 'Leptotene'],
    correctAnswer: 'Pachytene',
    solution:
      'Recombinase-mediated crossing over takes place during the pachytene substage of prophase I. Synapsis occurs in zygotene, and chiasmata become visible in diplotene.',
    difficulty: 'EASY',
  },
  {
    exam: 'NEET',
    classLevel: '11',
    subject: 'Biology',
    topic: 'Photosynthesis in Higher Plants',
    year: 'NEET 2023',
    questionType: 'MCQ',
    prompt: 'In $C_4$ plants, the primary $CO_2$ acceptor in mesophyll cells is:',
    options: ['Phosphoenolpyruvate (PEP)', 'RuBP', 'Oxaloacetic acid', '3-PGA'],
    correctAnswer: 'Phosphoenolpyruvate (PEP)',
    solution:
      'In Hatch-Slack ($C_4$) pathway, the 3-carbon compound PEP in mesophyll cells accepts $CO_2$ catalyzed by PEPcase to form oxaloacetic acid (OAA).',
    difficulty: 'EASY',
  },
  {
    exam: 'NEET',
    classLevel: '12',
    subject: 'Biology',
    topic: 'Molecular Basis of Inheritance',
    year: 'NEET 2024',
    questionType: 'MCQ',
    prompt: 'In the lac operon, binding of allolactose to the repressor protein results in:',
    options: [
      'Inactivation of the repressor so RNA polymerase transcribes structural genes',
      'Stronger binding of the repressor to the operator sequence',
      'Termination of transcription at the terminator site',
      'Repression of the lacZ, lacY, and lacA genes',
    ],
    correctAnswer: 'Inactivation of the repressor so RNA polymerase transcribes structural genes',
    solution:
      'Allolactose acts as an inducer, binding to the repressor protein to alter its conformation so it can no longer bind the operator, switching ON transcription of z, y, and a.',
    difficulty: 'MEDIUM',
  },
  {
    exam: 'NEET',
    classLevel: '12',
    subject: 'Biology',
    topic: 'Biotechnology: Principles & Processes',
    year: 'NEET 2024',
    questionType: 'MCQ',
    prompt: 'Which enzyme is used in Polymerase Chain Reaction (PCR) for extension of primers at $72^\\circ\\text{C}$?',
    options: ['Taq DNA polymerase', 'DNA ligase', 'EcoRI', 'Reverse transcriptase'],
    correctAnswer: 'Taq DNA polymerase',
    solution:
      'Thermostable Taq DNA polymerase isolated from *Thermus aquaticus* remains active during the high-temperature denaturation step ($94^\\circ\\text{C}$) and extends primers at $72^\\circ\\text{C}$.',
    difficulty: 'EASY',
  },
  {
    exam: 'NEET',
    classLevel: '11',
    subject: 'Physics',
    topic: 'Units & Measurements',
    year: 'NEET 2024',
    questionType: 'MCQ',
    prompt:
      'If percentage errors in measurement of mass and speed are $2\\%$ and $3\\%$ respectively, the maximum percentage error in kinetic energy is:',
    options: ['8%', '5%', '6%', '11%'],
    correctAnswer: '8%',
    solution:
      '$K = \\frac{1}{2}mv^2 \\Rightarrow \\frac{\\Delta K}{K} = \\frac{\\Delta m}{m} + 2\\frac{\\Delta v}{v} = 2\\% + 2(3\\%) = 8\\%$.',
    difficulty: 'EASY',
  },
  {
    exam: 'NEET',
    classLevel: '12',
    subject: 'Chemistry',
    topic: 'Coordination Compounds',
    year: 'NEET 2023',
    questionType: 'MCQ',
    prompt: 'The spin-only magnetic moment of $[FeF_6]^{3-}$ ($Z_{\\text{Fe}} = 26$) is approximately:',
    options: ['5.92 BM', '1.73 BM', '4.90 BM', '2.83 BM'],
    correctAnswer: '5.92 BM',
    solution:
      '$Fe^{3+}$ has $3d^5$ configuration and $F^-$ is a weak-field ligand, so $n = 5$ unpaired electrons. $\\mu = \\sqrt{n(n+2)} = \\sqrt{35} \\approx 5.92\\text{ BM}$.',
    difficulty: 'MEDIUM',
  },
];

export async function seedStarterPyqPack(
  uid: string,
  examFilter?: ExamType
): Promise<{ bankId: string; insertedCount: number }> {
  const chosen = examFilter
    ? STARTER_PYQ_SEEDS.filter((q) => q.exam === examFilter)
    : STARTER_PYQ_SEEDS;
  const items = chosen.length > 0 ? chosen : STARTER_PYQ_SEEDS;

  const bankRef = doc(collection(db, 'pyqBanks'));
  const title = examFilter
    ? `OBREN Verified Starter Pack — ${examFilter.replace('_', ' ')}`
    : 'OBREN All-India Starter PYQ Pack';

  try {
    await setDoc(bankRef, {
      ownerId: uid,
      title,
      fileName: 'obren-starter-pack.json',
      fileSizeBytes: 0,
      exam: examFilter || 'JEE_MAINS',
      classLevel: 'ALL',
      questionCount: items.length,
      visibility: 'PRIVATE',
      createdAt: serverTimestamp(),
    });

    for (let offset = 0; offset < items.length; offset += 12) {
      const batch = writeBatch(db);
      items.slice(offset, offset + 12).forEach((item) => {
        const qRef = doc(collection(db, 'pyqQuestions'));
        const payload: Omit<PyqQuestion, 'id' | 'createdAt'> & {
          createdAt: ReturnType<typeof serverTimestamp>;
        } = {
          ownerId: uid,
          bankId: bankRef.id,
          visibility: 'PRIVATE',
          exam: item.exam,
          classLevel: item.classLevel,
          subject: item.subject,
          topic: item.topic,
          year: item.year,
          questionType: item.questionType,
          prompt: item.prompt,
          options: item.options,
          correctAnswer: item.correctAnswer,
          solution: item.solution,
          difficulty: item.difficulty,
          createdAt: serverTimestamp(),
        };
        batch.set(qRef, payload);
      });
      await batch.commit();
    }

    return { bankId: bankRef.id, insertedCount: items.length };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'pyqBanks');
    throw err;
  }
}
