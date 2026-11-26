export interface DiagramTemplateInput {
  subject: 'Physics' | 'Chemistry' | 'Mathematics' | 'Biology';
  topic: string;
  category?: string;
  title?: string;
  caption?: string;
}

const ALLOWED_SVG_TAGS = new Set([
  'svg',
  'g',
  'defs',
  'marker',
  'path',
  'line',
  'rect',
  'circle',
  'ellipse',
  'polygon',
  'polyline',
  'text',
  'tspan',
  'title',
]);

const ALLOWED_ATTRS = new Set([
  'viewbox',
  'xmlns',
  'width',
  'height',
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-opacity',
  'opacity',
  'transform',
  'd',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'points',
  'dx',
  'dy',
  'font-size',
  'font-weight',
  'font-family',
  'text-anchor',
  'dominant-baseline',
  'id',
  'markerwidth',
  'markerheight',
  'refx',
  'refy',
  'orient',
  'marker-end',
  'marker-start',
  'markerunits',
]);

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strictly sanitizes AI-authored SVG markup on the server:
 * - Rejects script, foreignObject, iframe, style, image, use, or event handlers
 * - Strips unknown tags and unsafe attributes
 * - Ensures a valid viewBox and at least 3 geometric/text elements
 */
export function sanitizeSvgMarkup(rawSvg: string | undefined | null): string {
  if (!rawSvg || typeof rawSvg !== 'string') return '';
  let trimmed = rawSvg.trim();
  if (!trimmed) return '';

  const svgStart = trimmed.search(/<svg[\s>]/i);
  const svgEnd = trimmed.toLowerCase().lastIndexOf('</svg>');
  if (svgStart < 0 || svgEnd < 0 || svgEnd <= svgStart) return '';

  trimmed = trimmed.slice(svgStart, svgEnd + 6);
  if (trimmed.length > 18000) return '';

  // Reject dangerous blocks outright before attribute cleanup
  if (
    /<(script|foreignobject|iframe|object|embed|style|link|meta|audio|video|image|a)\b/i.test(trimmed) ||
    /javascript\s*:/i.test(trimmed) ||
    /data\s*:/i.test(trimmed) ||
    /\bon[a-z]+\s*=/i.test(trimmed)
  ) {
    return '';
  }

  let primitiveCount = 0;
  let hasRootSvg = false;

  // Clean tags & attributes
  const sanitized = trimmed.replace(
    /<(\/?)([a-zA-Z0-9:-]+)([^>]*)(\/?)>/g,
    (full, slash, rawTag, rawAttrs, selfClose) => {
      const tag = String(rawTag).toLowerCase();
      if (!ALLOWED_SVG_TAGS.has(tag)) {
        return '';
      }

      if (slash === '/') {
        return `</${tag}>`;
      }

      if (tag === 'svg') {
        hasRootSvg = true;
      } else if (tag !== 'defs' && tag !== 'marker' && tag !== 'g' && tag !== 'title') {
        primitiveCount += 1;
      }

      const cleanedAttrs: string[] = [];
      let hasViewBox = false;
      const attrRegex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let m: RegExpExecArray | null;
      while ((m = attrRegex.exec(rawAttrs)) !== null) {
        const attrName = m[1].toLowerCase();
        const attrVal = (m[2] ?? m[3] ?? '').trim();
        if (!ALLOWED_ATTRS.has(attrName)) continue;
        if (/url\s*\(\s*['"]?https?:/i.test(attrVal)) continue;
        if (attrName === 'viewbox') {
          hasViewBox = true;
          cleanedAttrs.push(`viewBox="${escapeXml(attrVal)}"`);
        } else if (attrName === 'markerwidth') {
          cleanedAttrs.push(`markerWidth="${escapeXml(attrVal)}"`);
        } else if (attrName === 'markerheight') {
          cleanedAttrs.push(`markerHeight="${escapeXml(attrVal)}"`);
        } else if (attrName === 'refx') {
          cleanedAttrs.push(`refX="${escapeXml(attrVal)}"`);
        } else if (attrName === 'refy') {
          cleanedAttrs.push(`refY="${escapeXml(attrVal)}"`);
        } else if (attrName === 'markerunits') {
          cleanedAttrs.push(`markerUnits="${escapeXml(attrVal)}"`);
        } else if (attrName !== 'width' && attrName !== 'height') {
          cleanedAttrs.push(`${attrName}="${escapeXml(attrVal)}"`);
        }
      }

      if (tag === 'svg') {
        if (!hasViewBox) cleanedAttrs.push('viewBox="0 0 460 280"');
        if (!cleanedAttrs.some((a) => a.startsWith('xmlns='))) {
          cleanedAttrs.push('xmlns="http://www.w3.org/2000/svg"');
        }
      }

      const attrStr = cleanedAttrs.length > 0 ? ` ${cleanedAttrs.join(' ')}` : '';
      return `<${tag}${attrStr}${selfClose ? '/' : ''}>`;
    }
  );

  if (!hasRootSvg || primitiveCount < 3) return '';
  return sanitized;
}

function inferCategory(input: DiagramTemplateInput): string {
  if (input.category) return input.category.toLowerCase();
  const text = `${input.topic} ${input.title || ''} ${input.caption || ''}`.toLowerCase();

  if (input.subject === 'Physics') {
    if (/incline|wedge|friction|pulley|block|newton|fbd|free[- ]body|tension/.test(text)) return 'physics_incline';
    if (/circuit|resistor|capacitor|ohm|kirchhoff|current|battery|cell|emf|wheatstone/.test(text)) return 'physics_circuit';
    if (/lens|mirror|ray|refraction|reflection|prism|optics|focal|snell/.test(text)) return 'physics_optics';
    if (/projectile|trajectory|parabola|range|kinematics|launch/.test(text)) return 'physics_projectile';
    if (/wave|shm|oscillation|sinusoid|sound|frequency|wavelength|doppler/.test(text)) return 'physics_wave';
    if (/magnetic|solenoid|lorentz|flux|faraday|induction|tesla|coil/.test(text)) return 'physics_bfield';
    return 'physics_graph';
  }
  if (input.subject === 'Chemistry') {
    if (/orbital|hybrid|molecular orbital|energy level|bohr|spectrum|electron/.test(text)) return 'chem_orbital';
    if (/titration|cell|electrode|galvanic|daniell|apparatus|distillation|burette/.test(text)) return 'chem_apparatus';
    if (/reaction|mechanism|alkene|benzene|organic|aldehyde|ketone|substitution|elimination/.test(text)) return 'chem_reaction';
    return 'chem_molecule';
  }
  if (input.subject === 'Mathematics') {
    if (/triangle|circle|chord|tangent|polygon|angle|geometry|vector|3d/.test(text)) return 'math_geometry';
    if (/parabola|ellipse|hyperbola|conic|focus|directrix/.test(text)) return 'math_conic';
    return 'math_graph';
  }
  if (/punnett|pedigree|dna|rna|genetics|allele|mendel|cross/.test(text)) return 'bio_genetics';
  if (/cell|mitochondria|nucleus|chloroplast|organelle|tissue|xylem|phloem/.test(text)) return 'bio_cell';
  return 'bio_process';
}

const ARROW_DEFS = `<defs>
  <marker id="arrowDark" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
    <path d="M0,1 L7,4 L0,7 Z" fill="#1e293b"/>
  </marker>
  <marker id="arrowIndigo" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
    <path d="M0,1 L7,4 L0,7 Z" fill="#4f46e5"/>
  </marker>
  <marker id="arrowRose" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
    <path d="M0,1 L7,4 L0,7 Z" fill="#e11d48"/>
  </marker>
  <marker id="arrowEmerald" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
    <path d="M0,1 L7,4 L0,7 Z" fill="#059669"/>
  </marker>
</defs>`;

/**
 * Generates clean, well-labeled educational scientific SVG schematics as a deterministic fallback
 * whenever a question requires a diagram and AI SVG/image output needs structural synthesis.
 */
export function buildProgrammaticEducationalSvg(input: DiagramTemplateInput): string {
  const cat = inferCategory(input);
  const safeTopic = escapeXml((input.title || input.topic || input.subject).slice(0, 46));

  let body = '';
  switch (cat) {
    case 'physics_incline':
    case 'physics_fbd':
      body = `
        <polygon points="60,220 390,220 390,85" fill="#e0e7ff" stroke="#334155" stroke-width="2.5"/>
        <path d="M120,220 A60,60 0 0,0 111,199" fill="none" stroke="#4f46e5" stroke-width="2"/>
        <text x="132" y="210" font-size="13" font-weight="bold" fill="#312e81">θ</text>
        <g transform="translate(245,144) rotate(-22.3)">
          <rect x="-26" y="-26" width="52" height="36" rx="4" fill="#fffbeb" stroke="#0f172a" stroke-width="2.2"/>
          <text x="0" y="-4" font-size="13" font-weight="bold" text-anchor="middle" fill="#0f172a">m</text>
          <line x1="0" y1="-26" x2="0" y2="-76" stroke="#059669" stroke-width="2.2" marker-end="url(#arrowEmerald)"/>
          <text x="8" y="-66" font-size="12" font-weight="bold" fill="#047857">N</text>
          <line x1="26" y1="-8" x2="82" y2="-8" stroke="#4f46e5" stroke-width="2.2" marker-end="url(#arrowIndigo)"/>
          <text x="64" y="-16" font-size="11" font-weight="bold" fill="#4338ca">F / f</text>
        </g>
        <line x1="250" y1="142" x2="250" y2="215" stroke="#e11d48" stroke-width="2.2" marker-end="url(#arrowRose)"/>
        <text x="258" y="200" font-size="12" font-weight="bold" fill="#be123c">mg</text>
        <text x="230" y="254" font-size="12" font-weight="bold" text-anchor="middle" fill="#334155">Free-Body Schematic · ${safeTopic}</text>
      `;
      break;

    case 'physics_circuit':
      body = `
        <polyline points="90,90 90,65 180,65" fill="none" stroke="#1e293b" stroke-width="2.4"/>
        <polyline points="180,65 190,52 204,78 218,52 232,78 246,52 256,65" fill="none" stroke="#4f46e5" stroke-width="2.5"/>
        <text x="218" y="42" font-size="12" font-weight="bold" text-anchor="middle" fill="#312e81">R₁</text>
        <line x1="256" y1="65" x2="370" y2="65" stroke="#1e293b" stroke-width="2.4"/>
        <line x1="370" y1="65" x2="370" y2="110" stroke="#1e293b" stroke-width="2.4"/>
        <polyline points="370,110 383,120 357,134 383,148 357,162 370,172" fill="none" stroke="#e11d48" stroke-width="2.5"/>
        <text x="396" y="146" font-size="12" font-weight="bold" fill="#be123c">R₂</text>
        <polyline points="370,172 370,215 90,215 90,152" fill="none" stroke="#1e293b" stroke-width="2.4"/>
        <line x1="70" y1="120" x2="110" y2="120" stroke="#0f172a" stroke-width="3"/>
        <line x1="79" y1="136" x2="101" y2="136" stroke="#0f172a" stroke-width="2.4"/>
        <line x1="90" y1="90" x2="90" y2="120" stroke="#1e293b" stroke-width="2.4"/>
        <line x1="90" y1="136" x2="90" y2="152" stroke="#1e293b" stroke-width="2.4"/>
        <text x="54" y="132" font-size="13" font-weight="bold" fill="#0f172a">V, r</text>
        <line x1="125" y1="54" x2="160" y2="54" stroke="#059669" stroke-width="2.2" marker-end="url(#arrowEmerald)"/>
        <text x="142" y="45" font-size="12" font-weight="bold" fill="#047857">I</text>
        <circle cx="170" cy="65" r="4" fill="#0f172a"/>
        <text x="170" y="84" font-size="11" font-weight="bold" text-anchor="middle" fill="#334155">A</text>
        <circle cx="290" cy="65" r="4" fill="#0f172a"/>
        <text x="290" y="84" font-size="11" font-weight="bold" text-anchor="middle" fill="#334155">B</text>
        <text x="230" y="254" font-size="12" font-weight="bold" text-anchor="middle" fill="#334155">Circuit Network · ${safeTopic}</text>
      `;
      break;

    case 'physics_optics':
      body = `
        <line x1="35" y1="150" x2="425" y2="150" stroke="#64748b" stroke-width="1.8" stroke-dasharray="5,4"/>
        <ellipse cx="230" cy="150" rx="14" ry="82" fill="#dbeafe" fill-opacity="0.7" stroke="#2563eb" stroke-width="2.4"/>
        <line x1="230" y1="62" x2="230" y2="238" stroke="#1d4ed8" stroke-width="1.4" stroke-dasharray="3,3"/>
        <circle cx="155" cy="150" r="3.5" fill="#0f172a"/>
        <text x="155" y="168" font-size="11" font-weight="bold" text-anchor="middle" fill="#0f172a">F₁</text>
        <circle cx="305" cy="150" r="3.5" fill="#0f172a"/>
        <text x="305" y="168" font-size="11" font-weight="bold" text-anchor="middle" fill="#0f172a">F₂</text>
        <line x1="95" y1="150" x2="95" y2="95" stroke="#059669" stroke-width="2.8" marker-end="url(#arrowEmerald)"/>
        <text x="95" y="85" font-size="11" font-weight="bold" text-anchor="middle" fill="#047857">Object (h)</text>
        <polyline points="95,95 230,95 365,205" fill="none" stroke="#e11d48" stroke-width="2" marker-end="url(#arrowRose)"/>
        <line x1="95" y1="95" x2="365" y2="205" stroke="#4f46e5" stroke-width="2" marker-end="url(#arrowIndigo)"/>
        <line x1="365" y1="150" x2="365" y2="205" stroke="#e11d48" stroke-width="2.5" marker-end="url(#arrowRose)"/>
        <text x="365" y="222" font-size="11" font-weight="bold" text-anchor="middle" fill="#be123c">Image (h')</text>
        <text x="230" y="258" font-size="12" font-weight="bold" text-anchor="middle" fill="#334155">Ray Optics Schematic · ${safeTopic}</text>
      `;
      break;

    case 'physics_projectile':
      body = `
        <line x1="55" y1="215" x2="415" y2="215" stroke="#1e293b" stroke-width="2" marker-end="url(#arrowDark)"/>
        <line x1="65" y1="225" x2="65" y2="45" stroke="#1e293b" stroke-width="2" marker-end="url(#arrowDark)"/>
        <path d="M65,215 Q225,25 385,215" fill="none" stroke="#4f46e5" stroke-width="2.8"/>
        <line x1="65" y1="215" x2="128" y2="152" stroke="#e11d48" stroke-width="2.4" marker-end="url(#arrowRose)"/>
        <text x="128" y="145" font-size="12" font-weight="bold" fill="#be123c">u</text>
        <text x="102" y="206" font-size="12" font-weight="bold" fill="#312e81">θ</text>
        <line x1="225" y1="120" x2="225" y2="215" stroke="#059669" stroke-width="1.8" stroke-dasharray="4,4"/>
        <text x="232" y="168" font-size="11" font-weight="bold" fill="#047857">H_max</text>
        <text x="225" y="232" font-size="11" font-weight="bold" text-anchor="middle" fill="#334155">Range R</text>
        <text x="230" y="260" font-size="12" font-weight="bold" text-anchor="middle" fill="#334155">Projectile Trajectory · ${safeTopic}</text>
      `;
      break;

    case 'physics_wave':
      body = `
        <line x1="40" y1="140" x2="420" y2="140" stroke="#64748b" stroke-width="1.8" marker-end="url(#arrowDark)"/>
        <line x1="55" y1="220" x2="55" y2="45" stroke="#64748b" stroke-width="1.8" marker-end="url(#arrowDark)"/>
        <path d="M55,140 C85,60 115,60 145,140 C175,220 205,220 235,140 C265,60 295,60 325,140 C355,220 385,220 405,140" fill="none" stroke="#4f46e5" stroke-width="2.8"/>
        <line x1="100" y1="80" x2="100" y2="140" stroke="#059669" stroke-width="1.8" stroke-dasharray="3,3"/>
        <text x="108" y="108" font-size="12" font-weight="bold" fill="#047857">A</text>
        <line x1="100" y1="68" x2="280" y2="68" stroke="#e11d48" stroke-width="1.8" marker-end="url(#arrowRose)"/>
        <text x="190" y="60" font-size="12" font-weight="bold" text-anchor="middle" fill="#be123c">Wavelength λ</text>
        <text x="230" y="256" font-size="12" font-weight="bold" text-anchor="middle" fill="#334155">Wave Profile · ${safeTopic}</text>
      `;
      break;

    case 'physics_bfield':
      body = `
        <rect x="85" y="45" width="290" height="175" rx="8" fill="#f1f5f9" stroke="#64748b" stroke-width="1.8" stroke-dasharray="5,4"/>
        ${[120, 175, 230, 285, 340]
          .flatMap((x) =>
            [80, 130, 180].map(
              (y) =>
                `<circle cx="${x}" cy="${y}" r="8" fill="none" stroke="#64748b" stroke-width="1.4"/><line x1="${x - 4}" y1="${y - 4}" x2="${x + 4}" y2="${y + 4}" stroke="#64748b" stroke-width="1.4"/><line x1="${x + 4}" y1="${y - 4}" x2="${x - 4}" y2="${y + 4}" stroke="#64748b" stroke-width="1.4"/>`
            )
          )
          .join('')}
        <circle cx="230" cy="130" r="56" fill="none" stroke="#4f46e5" stroke-width="2.6"/>
        <circle cx="286" cy="130" r="5" fill="#e11d48"/>
        <line x1="286" y1="130" x2="286" y2="78" stroke="#059669" stroke-width="2.2" marker-end="url(#arrowEmerald)"/>
        <text x="296" y="88" font-size="12" font-weight="bold" fill="#047857">v</text>
        <text x="352" y="65" font-size="13" font-weight="bold" fill="#1e293b">B (inward)</text>
        <text x="230" y="252" font-size="12" font-weight="bold" text-anchor="middle" fill="#334155">Magnetic Field Region · ${safeTopic}</text>
      `;
      break;

    case 'chem_orbital':
      body = `
        <line x1="75" y1="220" x2="75" y2="45" stroke="#1e293b" stroke-width="2" marker-end="url(#arrowDark)"/>
        <text x="58" y="55" font-size="12" font-weight="bold" fill="#1e293b">E</text>
        <line x1="115" y1="145" x2="175" y2="145" stroke="#4f46e5" stroke-width="3"/>
        <text x="145" y="164" font-size="11" font-weight="bold" text-anchor="middle" fill="#312e81">AO (1)</text>
        <line x1="285" y1="145" x2="345" y2="145" stroke="#4f46e5" stroke-width="3"/>
        <text x="315" y="164" font-size="11" font-weight="bold" text-anchor="middle" fill="#312e81">AO (2)</text>
        <line x1="200" y1="85" x2="260" y2="85" stroke="#e11d48" stroke-width="3"/>
        <text x="230" y="75" font-size="11" font-weight="bold" text-anchor="middle" fill="#be123c">Antibonding (σ* / π*)</text>
        <line x1="200" y1="195" x2="260" y2="195" stroke="#059669" stroke-width="3"/>
        <text x="230" y="213" font-size="11" font-weight="bold" text-anchor="middle" fill="#047857">Bonding (σ / π)</text>
        <line x1="175" y1="145" x2="200" y2="85" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4,3"/>
        <line x1="175" y1="145" x2="200" y2="195" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4,3"/>
        <line x1="285" y1="145" x2="260" y2="85" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4,3"/>
        <line x1="285" y1="145" x2="260" y2="195" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4,3"/>
        <text x="230" y="255" font-size="12" font-weight="bold" text-anchor="middle" fill="#334155">Orbital Energy Diagram · ${safeTopic}</text>
      `;
      break;

    case 'chem_apparatus':
      body = `
        <rect x="85" y="95" width="95" height="115" rx="6" fill="#eff6ff" stroke="#1e293b" stroke-width="2.2"/>
        <rect x="280" y="95" width="95" height="115" rx="6" fill="#ecfdf5" stroke="#1e293b" stroke-width="2.2"/>
        <path d="M150,120 L150,75 L310,75 L310,120" fill="none" stroke="#d97706" stroke-width="10" stroke-linecap="round"/>
        <text x="230" y="64" font-size="11" font-weight="bold" text-anchor="middle" fill="#b45309">Salt Bridge</text>
        <rect x="108" y="82" width="16" height="95" fill="#64748b" stroke="#0f172a" stroke-width="1.8"/>
        <text x="116" y="75" font-size="11" font-weight="bold" text-anchor="middle" fill="#0f172a">Anode (-)</text>
        <rect x="336" y="82" width="16" height="95" fill="#d97706" stroke="#0f172a" stroke-width="1.8"/>
        <text x="344" y="75" font-size="11" font-weight="bold" text-anchor="middle" fill="#0f172a">Cathode (+)</text>
        <line x1="116" y1="82" x2="116" y2="38" stroke="#1e293b" stroke-width="2"/>
        <line x1="344" y1="82" x2="344" y2="38" stroke="#1e293b" stroke-width="2"/>
        <line x1="116" y1="38" x2="344" y2="38" stroke="#4f46e5" stroke-width="2.2" marker-end="url(#arrowIndigo)"/>
        <text x="230" y="30" font-size="11" font-weight="bold" text-anchor="middle" fill="#4338ca">e⁻ flow</text>
        <text x="230" y="252" font-size="12" font-weight="bold" text-anchor="middle" fill="#334155">Electrochemical / Lab Setup · ${safeTopic}</text>
      `;
      break;

    case 'chem_reaction':
    case 'chem_molecule':
      body = `
        <polygon points="105,95 145,118 145,164 105,187 65,164 65,118" fill="#eef2ff" stroke="#1e293b" stroke-width="2.4"/>
        <circle cx="105" cy="141" r="22" fill="none" stroke="#4f46e5" stroke-width="1.8" stroke-dasharray="4,3"/>
        <line x1="105" y1="95" x2="105" y2="62" stroke="#1e293b" stroke-width="2.2"/>
        <text x="105" y="54" font-size="13" font-weight="bold" text-anchor="middle" fill="#0f172a">X / R</text>
        <line x1="175" y1="141" x2="275" y2="141" stroke="#0f172a" stroke-width="2.4" marker-end="url(#arrowDark)"/>
        <text x="225" y="128" font-size="12" font-weight="bold" text-anchor="middle" fill="#4338ca">Reagent / Δ</text>
        <polygon points="345,95 385,118 385,164 345,187 305,164 305,118" fill="#ecfdf5" stroke="#1e293b" stroke-width="2.4"/>
        <circle cx="345" cy="141" r="22" fill="none" stroke="#059669" stroke-width="1.8" stroke-dasharray="4,3"/>
        <line x1="345" y1="95" x2="345" y2="62" stroke="#1e293b" stroke-width="2.2"/>
        <text x="345" y="54" font-size="13" font-weight="bold" text-anchor="middle" fill="#047857">Product (Y)</text>
        <text x="230" y="250" font-size="12" font-weight="bold" text-anchor="middle" fill="#334155">Chemical Scheme · ${safeTopic}</text>
      `;
      break;

    case 'math_geometry':
      body = `
        <circle cx="215" cy="135" r="82" fill="#eef2ff" fill-opacity="0.5" stroke="#4f46e5" stroke-width="2.2"/>
        <polygon points="150,188 300,168 215,53" fill="#fffbeb" fill-opacity="0.7" stroke="#0f172a" stroke-width="2.2"/>
        <circle cx="215" cy="135" r="3.5" fill="#e11d48"/>
        <text x="222" y="132" font-size="12" font-weight="bold" fill="#be123c">O</text>
        <text x="136" y="198" font-size="13" font-weight="bold" fill="#0f172a">A</text>
        <text x="308" y="176" font-size="13" font-weight="bold" fill="#0f172a">B</text>
        <text x="215" y="44" font-size="13" font-weight="bold" text-anchor="middle" fill="#0f172a">C</text>
        <text x="230" y="254" font-size="12" font-weight="bold" text-anchor="middle" fill="#334155">Geometric Configuration · ${safeTopic}</text>
      `;
      break;

    case 'math_conic':
    case 'math_graph':
    case 'physics_graph':
      body = `
        <line x1="50" y1="205" x2="410" y2="205" stroke="#1e293b" stroke-width="2" marker-end="url(#arrowDark)"/>
        <line x1="120" y1="230" x2="120" y2="35" stroke="#1e293b" stroke-width="2" marker-end="url(#arrowDark)"/>
        <text x="415" y="209" font-size="12" font-weight="bold" fill="#0f172a">x</text>
        <text x="115" y="30" font-size="12" font-weight="bold" fill="#0f172a">y</text>
        <path d="M80,190 Q200,30 355,155" fill="none" stroke="#4f46e5" stroke-width="2.8"/>
        <line x1="95" y1="150" x2="365" y2="75" stroke="#e11d48" stroke-width="2" stroke-dasharray="5,4"/>
        <circle cx="215" cy="117" r="4.5" fill="#059669"/>
        <text x="224" y="112" font-size="12" font-weight="bold" fill="#047857">P(x₀, y₀)</text>
        <text x="230" y="258" font-size="12" font-weight="bold" text-anchor="middle" fill="#334155">Coordinate Plot · ${safeTopic}</text>
      `;
      break;

    case 'bio_cell':
      body = `
        <ellipse cx="230" cy="135" rx="145" ry="86" fill="#ecfdf5" stroke="#059669" stroke-width="3"/>
        <ellipse cx="230" cy="135" rx="135" ry="76" fill="none" stroke="#34d399" stroke-width="1.5" stroke-dasharray="4,3"/>
        <circle cx="210" cy="130" r="36" fill="#e0e7ff" stroke="#4f46e5" stroke-width="2.2"/>
        <circle cx="210" cy="130" r="12" fill="#4338ca"/>
        <text x="210" y="180" font-size="11" font-weight="bold" text-anchor="middle" fill="#312e81">Nucleus</text>
        <ellipse cx="305" cy="110" rx="28" ry="14" fill="#fef3c7" stroke="#d97706" stroke-width="2"/>
        <text x="305" y="90" font-size="11" font-weight="bold" text-anchor="middle" fill="#b45309">Mitochondrion</text>
        <ellipse cx="135" cy="155" rx="24" ry="12" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/>
        <text x="135" y="182" font-size="11" font-weight="bold" text-anchor="middle" fill="#1d4ed8">Organelle</text>
        <text x="230" y="255" font-size="12" font-weight="bold" text-anchor="middle" fill="#334155">Cellular Structure · ${safeTopic}</text>
      `;
      break;

    case 'bio_genetics':
      body = `
        <rect x="130" y="55" width="200" height="160" fill="#ffffff" stroke="#1e293b" stroke-width="2.2"/>
        <line x1="230" y1="55" x2="230" y2="215" stroke="#1e293b" stroke-width="2"/>
        <line x1="130" y1="135" x2="330" y2="135" stroke="#1e293b" stroke-width="2"/>
        <text x="180" y="44" font-size="13" font-weight="bold" text-anchor="middle" fill="#4f46e5">A</text>
        <text x="280" y="44" font-size="13" font-weight="bold" text-anchor="middle" fill="#4f46e5">a</text>
        <text x="112" y="100" font-size="13" font-weight="bold" text-anchor="middle" fill="#059669">A</text>
        <text x="112" y="180" font-size="13" font-weight="bold" text-anchor="middle" fill="#059669">a</text>
        <text x="180" y="102" font-size="16" font-weight="bold" text-anchor="middle" fill="#0f172a">AA</text>
        <text x="280" y="102" font-size="16" font-weight="bold" text-anchor="middle" fill="#0f172a">Aa</text>
        <text x="180" y="182" font-size="16" font-weight="bold" text-anchor="middle" fill="#0f172a">Aa</text>
        <text x="280" y="182" font-size="16" font-weight="bold" text-anchor="middle" fill="#e11d48">aa</text>
        <text x="230" y="252" font-size="12" font-weight="bold" text-anchor="middle" fill="#334155">Genetics Cross · ${safeTopic}</text>
      `;
      break;

    default:
      body = `
        <rect x="45" y="95" width="105" height="62" rx="10" fill="#eef2ff" stroke="#4f46e5" stroke-width="2.2"/>
        <text x="97" y="130" font-size="12" font-weight="bold" text-anchor="middle" fill="#312e81">Stage I</text>
        <line x1="150" y1="126" x2="180" y2="126" stroke="#0f172a" stroke-width="2.2" marker-end="url(#arrowDark)"/>
        <rect x="182" y="95" width="105" height="62" rx="10" fill="#ecfdf5" stroke="#059669" stroke-width="2.2"/>
        <text x="234" y="130" font-size="12" font-weight="bold" text-anchor="middle" fill="#065f46">Stage II</text>
        <line x1="287" y1="126" x2="317" y2="126" stroke="#0f172a" stroke-width="2.2" marker-end="url(#arrowDark)"/>
        <rect x="319" y="95" width="105" height="62" rx="10" fill="#fffbeb" stroke="#d97706" stroke-width="2.2"/>
        <text x="371" y="130" font-size="12" font-weight="bold" text-anchor="middle" fill="#92400e">Stage III</text>
        <text x="230" y="232" font-size="12" font-weight="bold" text-anchor="middle" fill="#334155">Process Schematic · ${safeTopic}</text>
      `;
      break;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 280">${ARROW_DEFS}<rect x="4" y="4" width="452" height="272" rx="12" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5"/>${body}</svg>`;
}
