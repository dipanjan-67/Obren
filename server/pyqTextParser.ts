export interface ParsedPyqQuestion {
  subject: 'Physics' | 'Chemistry' | 'Mathematics' | 'Biology';
  topic: string;
  classLevel: '11' | '12';
  year: string;
  questionType: 'MCQ' | 'NUMERICAL';
  prompt: string;
  options: string[];
  correctAnswer: string;
  solution: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
}

const PHYSICS_TOPICS: Array<[RegExp, string, '11' | '12']> = [
  [/electrostat|coulomb|gauss|capacitor|capacitance|dielectric|electric field|electric flux|dipole|potential/i, 'Electrostatics & Capacitance', '12'],
  [/current|resistor|resistivity|kirchhoff|wheatstone|ohm|potentiometer|ammeter|voltmeter|drift velocity|rc circuit/i, 'Current Electricity', '12'],
  [/magnet|biot|ampere|lorentz|solenoid|toroid|galvanometer|flux|faraday|lenz|inductance|alternating|lcr|transformer/i, 'Magnetism & EMI', '12'],
  [/optic|lens|mirror|refract|diffraction|interference|polariz|prism|snell|young|slit|telescope|microscope/i, 'Optics', '12'],
  [/photoelectric|bohr|de broglie|nucleus|nuclei|radioactiv|half[- ]life|binding energy|x[- ]ray|semiconductor|diode|zener|transistor|logic gate/i, 'Modern Physics & Semiconductors', '12'],
  [/em wave|electromagnetic wave|displacement current|poynting/i, 'Electromagnetic Waves', '12'],
  [/unit|dimension|vernier|screw gauge|significant figure|error analysis/i, 'Units & Measurements', '11'],
  [/kinematic|projectile|velocity|acceleration|displacement|relative motion|river|rain/i, 'Kinematics', '11'],
  [/newton|friction|pulley|tension|wedge|pseudo force|circular motion|centripetal|banking/i, 'Laws of Motion', '11'],
  [/work|kinetic energy|potential energy|power|collision|restitution|momentum|centre of mass|center of mass/i, 'Work, Energy & Power', '11'],
  [/torque|moment of inertia|angular momentum|rolling|rotational|rigid body|gyration/i, 'Rotational Motion', '11'],
  [/gravitation|kepler|escape velocity|orbital|satellite|geostationary/i, 'Gravitation', '11'],
  [/thermodynamic|carnot|isothermal|adiabatic|isobaric|isochoric|entropy|specific heat|ideal gas|kinetic theory|rms speed/i, 'Thermodynamics & KTG', '11'],
  [/shm|simple harmonic|pendulum|spring constant|wave|doppler|standing wave|organ pipe|beats|oscillation/i, 'Oscillations & Waves', '11'],
  [/bernoulli|viscosity|stokes|terminal velocity|surface tension|capillary|reynolds|young.?s modulus|bulk modulus|stress|strain|fluid/i, 'Properties of Matter & Fluids', '11'],
];

const CHEMISTRY_TOPICS: Array<[RegExp, string, '11' | '12']> = [
  [/mole|molarity|molality|stoichiometr|limiting reagent|empirical|equivalent weight|titration/i, 'Mole Concept', '11'],
  [/orbital|quantum number|hybridiz|vsepr|molecular orbital|hydrogen bond|dipole moment|photoelectron|planck/i, 'Chemical Bonding & Atomic Structure', '11'],
  [/enthalpy|gibbs|entropy|hess|thermochemistry|lattice energy|born[- ]haber/i, 'Chemical Thermodynamics', '11'],
  [/equilibrium|le chatelier|ph\b|pka|pkb|buffer|solubility product|ksp|hydrolysis/i, 'Chemical & Ionic Equilibrium', '11'],
  [/periodic|ionization enthalpy|electron gain|electronegativity|atomic radius/i, 'Periodic Classification', '11'],
  [/redox|oxidation state|disproportionation|nernst|emf|electrode potential|faraday|conductance|molar conductivity|kohlrausch|galvanic/i, 'Electrochemistry', '12'],
  [/rate constant|first order|second order|zero order|half[- ]life|arrhenius|activation energy|chemical kinetics|collision theory/i, 'Chemical Kinetics', '12'],
  [/raoult|colligative|osmotic|boiling point elevation|freezing point|henry.?s law|van.?t hoff/i, 'Solutions', '12'],
  [/coordination|ligand|crystal field|cfse|werner|chelate|iupac|isomer/i, 'Coordination Compounds', '12'],
  [/d[- ]block|f[- ]block|lanthan|actin|kmno4|k2cr2o7|transition metal|p[- ]block|noble gas|borax|silicate/i, 'Inorganic Block Chemistry', '12'],
  [/alkane|alkene|alkyne|benzene|aromatic|electrophilic|nucleophilic|sn1|sn2|e1|e2|grignard|aldol|cannizzaro|aldehyde|ketone|carboxylic|amine|diazonium|phenol|haloalkane|carbocation|chirality|enantiomer/i, 'Organic Chemistry', '12'],
  [/biomolecule|polymer|amino acid|glucose|sucrose|peptide|zwitterion|vitamin|nucleic acid/i, 'Biomolecules & Polymers', '12'],
];

const MATH_TOPICS: Array<[RegExp, string, '11' | '12']> = [
  [/integrat|definite integral|indefinite|differential equation|area bounded|dy\/dx|integrating factor/i, 'Integral Calculus & DE', '12'],
  [/limit|continuity|differentiab|derivative|tangent|normal|maxima|minima|rolle|lagrange|monoton/i, 'Differential Calculus', '12'],
  [/matrix|matrices|determinant|eigen|adjoint|cramer|singular|invertible/i, 'Matrices & Determinants', '12'],
  [/vector|dot product|cross product|scalar triple|3d|direction cosine|plane|skew lines|shortest distance/i, 'Vectors & 3D Geometry', '12'],
  [/probabilit|bayes|binomial distribution|bernoulli trial|variance|mean|standard deviation|random variable/i, 'Probability & Statistics', '12'],
  [/parabola|ellipse|hyperbola|conic|eccentricity|latus rectum|circle|chord|straight line|slope|centroid|orthocentre/i, 'Coordinate Geometry', '11'],
  [/complex number|argand|modulus|argument|euler|quadratic|roots|progression|ap\b|gp\b|hp\b|binomial theorem|permutation|combination/i, 'Algebra', '11'],
  [/sin|cos|tan|cot|sec|cosec|trigonometric|inverse trig|arcsin|arctan/i, 'Trigonometry', '11'],
  [/set|relation|function|domain|range|bijective|one-one|onto|equivalence/i, 'Sets, Relations & Functions', '11'],
];

const BIOLOGY_TOPICS: Array<[RegExp, string, '11' | '12']> = [
  [/dna|rna|transcription|translation|codon|lac operon|okazaki|mendel|allele|genetics|linkage|chromosome|pedigree/i, 'Genetics & Molecular Biology', '12'],
  [/pcr|plasmid|restriction enzyme|biotechnolog|recombinant|ecori|vector|bt toxin/i, 'Biotechnology', '12'],
  [/ecosystem|biodiversity|trophic|succession|ecology|population|biome|niche|ozone/i, 'Ecology', '12'],
  [/mitochondria|chloroplast|golgi|endoplasmic|ribosome|cell cycle|mitosis|meiosis|crossing over/i, 'Cell Biology', '11'],
  [/photosynthesis|calvin cycle|c3\b|c4\b|krebs|glycolysis|respiration|auxin|gibberellin|cytokinin|abscisic|ethylene/i, 'Plant Physiology', '11'],
  [/nephron|glomerul|alveoli|cardiac|ecg|hemoglobin|hormone|pituitary|thyroid|synapse|neuron|digestion|enzyme|sarcomere/i, 'Human Physiology', '11'],
  [/gametogenesis|spermatogenesis|oogenesis|embryo|pollination|endosperm|placenta|reproduction|menstrual/i, 'Reproduction', '12'],
  [/taxonomy|binomial nomenclature|bryophyte|pteridophyte|gymnosperm|angiosperm|arthropoda|mollusca|chordata/i, 'Diversity of Living Organisms', '11'],
  [/immunity|antibody|antigen|malaria|hiv|aids|vaccine|microbe|fermentation/i, 'Human Health & Microbes', '12'],
];

export function normalizeMathText(input: string): string {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\u00ad/g, '')
    .replace(/\ufb01/g, 'fi')
    .replace(/\ufb02/g, 'fl')
    .replace(/[−–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\t/g, ' ');
}

function inferSubjectAndTopic(
  text: string,
  exam: string,
  defaultClass: string,
  subjectHint?: string
): {
  subject: ParsedPyqQuestion['subject'];
  topic: string;
  classLevel: '11' | '12';
} {
  const validSubjects: ParsedPyqQuestion['subject'][] =
    exam === 'NEET'
      ? ['Physics', 'Chemistry', 'Biology']
      : ['Physics', 'Chemistry', 'Mathematics'];

  for (const [rx, topic, cls] of PHYSICS_TOPICS) {
    if (rx.test(text)) return { subject: 'Physics', topic, classLevel: cls };
  }
  for (const [rx, topic, cls] of CHEMISTRY_TOPICS) {
    if (rx.test(text)) return { subject: 'Chemistry', topic, classLevel: cls };
  }
  if (exam === 'NEET') {
    for (const [rx, topic, cls] of BIOLOGY_TOPICS) {
      if (rx.test(text)) return { subject: 'Biology', topic, classLevel: cls };
    }
  } else {
    for (const [rx, topic, cls] of MATH_TOPICS) {
      if (rx.test(text)) return { subject: 'Mathematics', topic, classLevel: cls };
    }
  }

  const subject: ParsedPyqQuestion['subject'] =
    subjectHint && validSubjects.includes(subjectHint as ParsedPyqQuestion['subject'])
      ? (subjectHint as ParsedPyqQuestion['subject'])
      : validSubjects[0];

  const classLevel: '11' | '12' =
    defaultClass === '11' || defaultClass === '12' ? defaultClass : '12';

  return { subject, topic: 'Core PYQ', classLevel };
}

export function extractExplicitKeySections(text: string): string {
  const sections: string[] = [];
  const headerRx =
    /(?:^|\n)\s*(?:ANSWER\s*KEY|ANSWERS|OFFICIAL\s*KEY|HINTS\s*(?:&|AND)\s*SOLUTIONS|SOLUTIONS\s*(?:&|AND)\s*ANSWER\s*KEY)\b[\s\S]{0,12000}/gi;
  let m: RegExpExecArray | null;
  while ((m = headerRx.exec(text)) !== null) {
    sections.push(m[0]);
  }
  if (sections.length > 0) {
    return sections.join('\n');
  }

  // Also capture trailing dense key-grid lines (e.g., "1. (A)  2. (C)  3. (B)")
  const lines = text.split('\n');
  const gridLines = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    const keyTokens = trimmed.match(/\b\d{1,3}\s*[\.\)\:\-]?\s*\(?[A-Da-d1-4]\)?(?=\s|,|;|$)/g) || [];
    return keyTokens.length >= 2 && trimmed.length < 180;
  });
  return gridLines.join('\n');
}

function extractAnswerKeyMap(fullText: string, externalKeyContext?: string): Map<number, string> {
  const keyMap = new Map<number, string>();
  const scanArea = [externalKeyContext || '', extractExplicitKeySections(fullText)]
    .filter(Boolean)
    .join('\n');

  if (!scanArea.trim()) {
    return keyMap;
  }

  // Match strict key tokens like "1. (A)", "1) b", "Q.1: (3)", "12 - D", "15. 42.5"
  const pairRegex =
    /(?:^|\s|,|;)Q?\.?\s*(\d{1,3})\s*(?:[\.\)\:\-]\s*|\s+)\(?([A-Da-d1-4]|-?\d+(?:\.\d+)?)\)?(?=\s|,|;|$)/g;
  let m: RegExpExecArray | null;
  while ((m = pairRegex.exec(scanArea)) !== null) {
    const qNum = parseInt(m[1], 10);
    const val = m[2].trim().toUpperCase();
    if (qNum > 0 && qNum <= 300 && val && !keyMap.has(qNum)) {
      keyMap.set(qNum, val);
    }
  }
  return keyMap;
}

function extractSolutionMap(fullText: string, externalKeyContext?: string): Map<number, string> {
  const solMap = new Map<number, string>();
  const source = [externalKeyContext || '', fullText].filter(Boolean).join('\n');
  const hintsMatch = source.match(
    /(?:^|\n)\s*(?:HINTS\s*(?:&|AND)\s*SOLUTIONS|DETAILED\s*SOLUTIONS|SOLUTIONS)\b([\s\S]{0,16000})$/i
  );
  if (!hintsMatch) return solMap;

  const section = hintsMatch[1];
  const itemRx = /(?:^|\n)\s*(?:Q?\.?\s*|Sol\.?\s*)(\d{1,3})\s*[\.\)\:]\s*(?:\([A-Da-d1-4]\)\s*)?/g;
  const bounds: Array<{ qNum: number; start: number; bodyStart: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = itemRx.exec(section)) !== null) {
    const qNum = parseInt(m[1], 10);
    if (qNum >= 1 && qNum <= 300) {
      bounds.push({ qNum, start: m.index, bodyStart: m.index + m[0].length });
    }
  }

  for (let i = 0; i < bounds.length; i += 1) {
    const cur = bounds[i];
    const nextStart = i + 1 < bounds.length ? bounds[i + 1].start : section.length;
    const body = section.slice(cur.bodyStart, nextStart).replace(/\s+/g, ' ').trim();
    if (body.length >= 10 && !solMap.has(cur.qNum)) {
      solMap.set(cur.qNum, body.slice(0, 2000));
    }
  }
  return solMap;
}

function extractTrailingYearTag(text: string): { cleaned: string; yearTag: string } {
  const rx =
    /\s*[\[\(]\s*((?:JEE\s*(?:Main|Mains|Adv(?:anced)?)|NEET|AIEEE|AIPMT|IIT[- ]?JEE)[^\]\)]{0,28}(?:19\d\d|20[0-2]\d)[^\]\)]{0,18}|(?:19\d\d|20[0-2]\d)\s*(?:Shift|Jan|Apr|Feb|Sep|Session|Phase)[^\]\)]{0,18})\s*[\]\)]\s*$/i;
  const m = text.match(rx);
  if (!m || m.index === undefined) {
    return { cleaned: text, yearTag: '' };
  }
  return {
    cleaned: text.slice(0, m.index).trim(),
    yearTag: m[1].replace(/\s+/g, ' ').trim().slice(0, 30),
  };
}

function splitOptionsFromBlock(blockText: string): {
  stem: string;
  options: string[];
  inlineAnswer: string;
  inlineSolution: string;
  optionYearTag: string;
} {
  let working = blockText;
  let inlineAnswer = '';
  let inlineSolution = '';
  let optionYearTag = '';

  const solMatch = working.match(
    /(?:^|\n)\s*(?:Sol(?:ution)?|Exp(?:lanation)?|Hint)\s*[:\.\-]\s*([\s\S]+)$/i
  );
  if (solMatch && solMatch.index !== undefined) {
    inlineSolution = solMatch[1].trim().slice(0, 2500);
    working = working.slice(0, solMatch.index).trim();
  }

  const ansMatch = working.match(
    /(?:^|\n|\s)(?:Ans(?:wer)?|Correct\s*(?:Option|Answer)|Key)\s*[:\.\-]\s*\(?([A-Da-d1-4]|-?\d+(?:\.\d+)?)\)?\.?\s*$/i
  );
  if (ansMatch && ansMatch.index !== undefined) {
    inlineAnswer = ansMatch[1].trim().toUpperCase();
    working = working.slice(0, ansMatch.index).trim();
  }

  // Try ascending A..D or 1..4 across standard JEE/NEET option formats
  const optionPatterns = [
    /(?:^|\n|\s)\(([A-Da-d])\)\s+/g,
    /(?:^|\n|\s)([A-Da-d])\)\s+/g,
    /(?:^|\n|\s)([A-Da-d])\.\s+(?=\S)/g,
    /(?:^|\n|\s)\(([1-4])\)\s+/g,
    /(?:^|\n|\s)([1-4])\)\s+/g,
  ];

  for (const rx of optionPatterns) {
    rx.lastIndex = 0;
    const markers: Array<{ label: string; start: number; contentStart: number }> = [];
    let match: RegExpExecArray | null;
    while ((match = rx.exec(working)) !== null) {
      markers.push({
        label: match[1].toUpperCase(),
        start: match.index,
        contentStart: match.index + match[0].length,
      });
    }

    // Look for valid contiguous A, B, C, D or 1, 2, 3, 4 sequence
    for (let startIdx = 0; startIdx <= markers.length - 4; startIdx += 1) {
      const first = markers[startIdx];
      if (first.label !== 'A' && first.label !== '1') continue;
      const expectedLetters = first.label === 'A' ? ['A', 'B', 'C', 'D'] : ['1', '2', '3', '4'];
      const seq = markers.slice(startIdx, startIdx + 4);
      const validSeq = seq.every((m, idx) => m.label === expectedLetters[idx]);
      if (!validSeq) continue;

      const stem = working.slice(0, seq[0].start).trim();
      const options = seq.map((m, idx) => {
        const end = idx + 1 < seq.length ? seq[idx + 1].start : working.length;
        let optText = working.slice(m.contentStart, end).replace(/\s+/g, ' ').trim();
        if (idx === 3) {
          const yearRes = extractTrailingYearTag(optText);
          if (yearRes.yearTag) {
            optionYearTag = yearRes.yearTag;
            optText = yearRes.cleaned;
          }
        }
        return optText;
      });
      if (stem.length >= 10 && options.every((o) => o.length >= 1)) {
        return { stem, options, inlineAnswer, inlineSolution, optionYearTag };
      }
    }
  }

  return {
    stem: working.trim(),
    options: [],
    inlineAnswer,
    inlineSolution,
    optionYearTag,
  };
}

export function extractPyqsDeterministically(
  rawText: string,
  exam: string,
  defaultClass: string,
  subjectHint?: string,
  answerKeyContext?: string
): ParsedPyqQuestion[] {
  const normalized = normalizeMathText(rawText).trim();
  if (normalized.length < 40) return [];

  const normalizedKeyCtx = answerKeyContext ? normalizeMathText(answerKeyContext) : '';
  const answerKeyMap = extractAnswerKeyMap(normalized, normalizedKeyCtx);
  const solutionMap = extractSolutionMap(normalized, normalizedKeyCtx);

  // Stop scanning question boundaries once an Answer Key or Hints & Solutions section begins
  const trailingSectionMatch = normalized.match(
    /(?:^|\n)\s*(?:ANSWER\s*KEY|OFFICIAL\s*KEY|HINTS\s*(?:&|AND)\s*SOLUTIONS|DETAILED\s*SOLUTIONS)\b/i
  );
  const questionScanText =
    trailingSectionMatch && trailingSectionMatch.index !== undefined && trailingSectionMatch.index > 80
      ? normalized.slice(0, trailingSectionMatch.index).trim()
      : normalized;

  // Split blocks by clear question number prefixes at line start
  // Prefer Q.1 / Question 1 / 1. so 1) .. 4) option lists aren't split into fake questions
  const dotOrQRegex =
    /(?:^|\n)\s*(?:Q(?:uestion)?\.?\s*#?\s*(\d{1,3})\s*[\.\):\-]?|(\d{1,3})\.(?=\s+(?:[A-Z(\["'\d]|\[)))/g;
  const parenQRegex =
    /(?:^|\n)\s*(\d{1,3})\)(?=\s+(?:[A-Z(\["'\d]|\[))/g;

  const boundaries: Array<{ qNum: number; contentStart: number; matchStart: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = dotOrQRegex.exec(questionScanText)) !== null) {
    const qNum = parseInt(match[1] || match[2], 10);
    if (qNum >= 1 && qNum <= 300) {
      boundaries.push({
        qNum,
        matchStart: match.index,
        contentStart: match.index + match[0].length,
      });
    }
  }

  // Only fall back to "1)" question prefixes if no "Q." or "1." questions were found
  if (boundaries.length === 0) {
    while ((match = parenQRegex.exec(questionScanText)) !== null) {
      const qNum = parseInt(match[1], 10);
      if (qNum >= 1 && qNum <= 300) {
        boundaries.push({
          qNum,
          matchStart: match.index,
          contentStart: match.index + match[0].length,
        });
      }
    }
  }

  if (boundaries.length === 0) return [];

  const extracted: ParsedPyqQuestion[] = [];
  for (let i = 0; i < boundaries.length; i += 1) {
    const cur = boundaries[i];
    const nextStart = i + 1 < boundaries.length ? boundaries[i + 1].matchStart : questionScanText.length;
    let rawBlock = questionScanText.slice(cur.contentStart, nextStart).trim();

    if (/^(?:ANSWER\s*KEY|ANSWERS|HINTS\s*(?:&|AND)\s*SOLUTIONS|SOLUTIONS)\b/i.test(rawBlock)) {
      break;
    }
    rawBlock = rawBlock
      .replace(/(?:^|\n)\s*(?:ANSWER\s*KEY|ANSWERS|OFFICIAL\s*KEY|HINTS\s*(?:&|AND)\s*SOLUTIONS|SOLUTIONS)\b[\s\S]*$/i, '')
      .trim();

    const { stem, options, inlineAnswer, inlineSolution, optionYearTag } = splitOptionsFromBlock(rawBlock);
    if (stem.length < 15 || stem.length > 3500) continue;

    const keyAnswer = inlineAnswer || answerKeyMap.get(cur.qNum) || '';
    const hasMcqOptions = options.length >= 2;
    const looksLikeNumericalQuestion =
      !hasMcqOptions &&
      (/^-?\d+(?:\.\d+)?$/.test(keyAnswer) ||
        /\b(?:integer|numerical|find the value|round off|nearest integer|value of)\b/i.test(stem));

    if (!hasMcqOptions && !looksLikeNumericalQuestion) {
      continue;
    }

    const yearMatch = rawBlock.match(
      /[\[\(]?\s*((?:JEE\s*(?:Main|Mains|Adv(?:anced)?)|NEET|AIEEE|AIPMT)[^\]\)]{0,24}(?:19\d\d|20[0-2]\d)[^\]\)]{0,16}|(?:19\d\d|20[0-2]\d)\s*(?:Shift|Jan|Apr|Feb|Sep|Session)?[^\]\)]{0,14})\s*[\]\)]?/i
    );
    const year =
      optionYearTag ||
      (yearMatch ? yearMatch[1].replace(/\s+/g, ' ').trim().slice(0, 30) : 'PYQ');

    const questionType: 'MCQ' | 'NUMERICAL' = hasMcqOptions ? 'MCQ' : 'NUMERICAL';
    let correctAnswer = keyAnswer;
    if (questionType === 'MCQ' && options.length > 0) {
      const idxMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, '1': 0, '2': 1, '3': 2, '4': 3 };
      if (correctAnswer in idxMap && options[idxMap[correctAnswer]]) {
        correctAnswer = options[idxMap[correctAnswer]];
      } else {
        correctAnswer = options[0];
      }
    } else if (!correctAnswer) {
      correctAnswer = '0';
    }

    const inferred = inferSubjectAndTopic(stem, exam, defaultClass, subjectHint);
    const resolvedSolution =
      inlineSolution || solutionMap.get(cur.qNum) || 'Verify core formula and step-by-step substitution.';

    extracted.push({
      subject: inferred.subject,
      topic: inferred.topic,
      classLevel: inferred.classLevel,
      year,
      questionType,
      prompt: stem.slice(0, 3900),
      options,
      correctAnswer: correctAnswer.slice(0, 190),
      solution: resolvedSolution.slice(0, 3900),
      difficulty: exam === 'JEE_ADV' ? 'HARD' : 'MEDIUM',
    });
  }

  return extracted;
}
