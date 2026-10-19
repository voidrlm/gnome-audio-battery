// Works out a device's brand and shape from its Bluetooth name, so the ring
// shows earbuds, over-ear headphones, a neckband or a speaker instead of the
// one "headset" icon BlueZ gives nearly everything with a microphone.
//
// Each brand: a pattern for the name, the shape most of its range has, and
// model patterns (checked first, in order) for the rest.

const BRANDS = [
    ['Apple', /\bairpods\b/i, 'earbuds', [[/max/i, 'headphones']]],
    ['Beats', /\bbeats\b|powerbeats|\bstudio ?buds|\bsolo ?(pro|buds|\d)/i, 'earbuds', [
        [/studio ?(pro|\d)|solo ?(pro|\d)/i, 'headphones'], [/flex|\bx\b/i, 'neckband'], [/pill/i, 'speaker']]],
    ['Samsung', /galaxy buds|samsung|\blevel ?(u|on)\b/i, 'earbuds', [
        [/level ?on/i, 'headphones'], [/level ?u/i, 'neckband']]],
    ['Sony', /(^|[\s_])(wf|wh|wi|srs|mdr)-|linkbuds|\bult (wear|field)|\bsony\b|inzone/i, 'headphones', [
        [/wf-|linkbuds|float run|inzone buds/i, 'earbuds'], [/wi-/i, 'neckband'],
        [/srs-|ult field/i, 'speaker'], [/inzone/i, 'headset']]],
    ['Bose', /\bbose\b|quietcomfort|soundlink|\bqc ?\d|soundsport|ultra open|nc ?700|sleepbuds/i, 'headphones', [
        [/earbuds|buds|soundsport|ultra open|sleepbuds/i, 'earbuds'], [/soundlink(?! (around|flex hp))/i, 'speaker']]],
    ['Jabra', /\bjabra\b/i, 'earbuds', [
        [/elite ?(45h|85h)|evolve2? ?(65|75|85)/i, 'headphones'], [/talk/i, 'headset']]],
    ['Sennheiser', /sennheiser|momentum|accentum|\bcx ?(plus|true|sport|\d{3})/i, 'headphones', [
        [/true wireless|\btw\b|\bcx\b|sport/i, 'earbuds']]],
    ['Skullcandy', /skullcandy|smokin'? ?buds|\b(indy|dime|sesh|jib|crusher|hesh|ink'?d|push (active|ultra|360)|grind fuel|rail anc|method 360|riff wireless|venue anc)\b/i, 'earbuds', [
        [/crusher|hesh|riff|venue|cassette|grind(?! fuel)/i, 'headphones'], [/ink'?d|method/i, 'neckband']]],
    ['JBL', /\bjbl\b/i, 'earbuds', [
        [/flip|charge|clip|\bgo\b|xtreme|boombox|pulse|partybox|wind/i, 'speaker'],
        [/(tune|live|tour) ?(5|6|7)\d0(?!.*tws)|club|quantum/i, 'headphones'], [/(tune|live) ?2\d0(?!.*tws)/i, 'neckband']]],
    ['Soundcore', /soundcore|anker/i, 'earbuds', [
        [/liberty|life ?(p|a|note|dot)|space ?a40/i, 'earbuds'], [/life ?q|space ?(q45|one)/i, 'headphones'], [/motion|boom|flare|select/i, 'speaker']]],
    ['Nothing', /\bnothing\b|\bear ?\((1|2|3|a|stick|open)\)|\bcmf\b|\bheadphone ?\(1\)/i, 'earbuds', [
        [/headphone/i, 'headphones'], [/neckband/i, 'neckband']]],
    ['OnePlus', /oneplus|\bnord buds/i, 'earbuds', [[/bullets wireless/i, 'neckband']]],
    ['Google', /pixel buds/i, 'earbuds', []],
    ['Xiaomi', /xiaomi|redmi|\bmi (true|air|neckband)|airdots|\bmi portable/i, 'earbuds', [
        [/neckband/i, 'neckband'], [/speaker|portable/i, 'speaker']]],
    ['Huawei', /huawei|freebuds|freelace|freeclip/i, 'earbuds', [[/freelace/i, 'neckband'], [/studio/i, 'headphones']]],
    ['Honor', /\bhonor\b/i, 'earbuds', []],
    ['OPPO', /\boppo\b|\benco\b/i, 'earbuds', [[/\bm\d+\b/i, 'neckband']]],
    ['realme', /realme/i, 'earbuds', [[/wireless ?\d/i, 'neckband']]],
    ['vivo', /\bvivo\b|\biqoo\b/i, 'earbuds', [[/wireless sport|neckband/i, 'neckband']]],
    ['Nokia', /\bnokia\b/i, 'earbuds', []],
    ['Motorola', /motorola|\bmoto ?buds|verve/i, 'earbuds', []],
    ['LG', /\blg\b|tone ?(free|flex|ultra|pro|style)/i, 'earbuds', [[/tone ?(flex|ultra|pro|style)/i, 'neckband'], [/xboom/i, 'speaker']]],
    ['Marshall', /marshall|\b(major|monitor|minor|mode|motif) (i|ii|iii|iv|v)\b|\b(emberton|stanmore|acton|woburn|middleton|willen|tufton|kilburn)\b/i, 'headphones', [
        [/minor|mode|motif/i, 'earbuds'], [/emberton|stanmore|acton|woburn|middleton|willen|tufton|kilburn/i, 'speaker']]],
    ['Bang & Olufsen', /beoplay|beosound|beolit|\bb&o\b|bang ?& ?olufsen/i, 'headphones', [
        [/\be\d\b|\beq\b|ex\b/i, 'earbuds'], [/beosound|beolit|\ba\d\b/i, 'speaker']]],
    ['Audio-Technica', /audio-?technica|\bath-/i, 'headphones', [[/ath-(ck|cks|sq|tws)/i, 'earbuds']]],
    ['Shure', /\bshure\b|aonic/i, 'earbuds', [[/aonic ?(40|50)/i, 'headphones']]],
    ['AKG', /\bakg\b/i, 'headphones', [[/\bn ?(400|5005|200)\b/i, 'earbuds']]],
    ['Jaybird', /jaybird|\btarah\b/i, 'earbuds', [[/tarah|x4/i, 'neckband']]],
    ['Poly', /plantronics|\bpoly\b|voyager|backbeat/i, 'headset', [
        [/voyager free|backbeat (fit|pro 5100)/i, 'earbuds'], [/backbeat (pro|go 810)/i, 'headphones']]],
    ['Logitech', /logitech|\blogi\b|zone (wireless|vibe)|\bg\d{3}\b|astro/i, 'headset', [[/zone true/i, 'earbuds']]],
    ['Razer', /razer|barracuda|kraken|blackshark|hammerhead/i, 'headset', [[/hammerhead/i, 'earbuds']]],
    ['SteelSeries', /steelseries|arctis/i, 'headset', []],
    ['HyperX', /hyperx|cloud (alpha|flight|mix|stinger)/i, 'headset', [[/cirro|buds/i, 'earbuds']]],
    ['Corsair', /corsair|\bvirtuoso|\bhs\d{2}\b/i, 'headset', []],
    ['Turtle Beach', /turtle ?beach|stealth ?\d/i, 'headset', [[/scout/i, 'earbuds']]],
    ['Edifier', /edifier/i, 'earbuds', [[/w8\d{2}|w\d{3}nb|wh\d/i, 'headphones'], [/\bm\d{3}|\bmp\d|\bqd35\b/i, 'speaker']]],
    ['SoundPEATS', /soundpeats|sound ?peats/i, 'earbuds', [[/space\b/i, 'headphones']]],
    ['TOZO', /\btozo\b/i, 'earbuds', [[/ht2/i, 'headphones']]],
    ['QCY', /\bqcy\b/i, 'earbuds', [[/h2|h3/i, 'headphones']]],
    ['EarFun', /earfun/i, 'earbuds', [[/wave/i, 'headphones'], [/uboom/i, 'speaker']]],
    ['1MORE', /1more/i, 'earbuds', [[/sonoflow/i, 'headphones']]],
    ['Haylou', /haylou/i, 'earbuds', []],
    ['Urbanista', /urbanista/i, 'earbuds', [[/los angeles|miami|seattle/i, 'headphones'], [/malibu|brooklyn/i, 'speaker']]],
    ['Philips', /philips|\bta[th]\d{4}/i, 'earbuds', [[/ta?h(4|5|6|8|9)\d0\d/i, 'headphones']]],
    ['Technics', /technics|panasonic|\beah-/i, 'earbuds', [[/eah-a8\d\d|eah-a800|rb-/i, 'headphones']]],
    ['Bowers & Wilkins', /bowers|\bb&w\b|\bp[xi] ?\d\b|zeppelin/i, 'headphones', [[/\bpi ?\d/i, 'earbuds'], [/zeppelin/i, 'speaker']]],
    ['Master & Dynamic', /master ?& ?dynamic|\bm&d\b|\bmw ?\d{2}|\bmh ?\d{2}/i, 'headphones', [[/mw ?(07|08|09)/i, 'earbuds']]],
    ['boAt', /\bboat\b|airdopes|rockerz|stone ?\d|immortal/i, 'earbuds', [
        [/rockerz ?(2|3)\d{2}/i, 'neckband'], [/rockerz ?(4|5|6)\d{2}|nirvana/i, 'headphones'], [/stone/i, 'speaker']]],
    ['Noise', /\bnoise\b(?! ?cancel)|airwave/i, 'earbuds', [[/airwave|tune (active|sport)|neck/i, 'neckband'], [/two/i, 'headphones']]],
    ['boult', /\bboult\b|\bz40\b|\bk40\b/i, 'earbuds', [[/curve|probass/i, 'neckband'], [/\bq\b|thunder/i, 'headphones']]],
    ['Mivi', /\bmivi\b|duopods|superpods/i, 'earbuds', [[/collar/i, 'neckband'], [/roam|play|octave/i, 'speaker']]],
    ['Ultimate Ears', /ultimate ears|\bue\b|\b(wonderboom|megaboom|everboom|hyperboom)\b/i, 'speaker', [[/\bfits\b/i, 'earbuds']]],
    ['Tribit', /tribit|stormbox|xsound/i, 'speaker', [[/flybuds|movebuds/i, 'earbuds'], [/quietplus/i, 'headphones']]],
    ['Amazon', /echo buds/i, 'earbuds', []],
    ['Fairphone', /fairbuds/i, 'earbuds', [[/\bxl\b/i, 'headphones']]],
    ['Moondrop', /moondrop/i, 'earbuds', [[/edge|joker/i, 'headphones']]],
    ['Denon', /\bdenon\b|\bperl\b/i, 'earbuds', [[/ah-/i, 'headphones']]],
    ['Audeze', /audeze|maxwell|penrose/i, 'headset', []],
    ['Sudio', /\bsudio\b/i, 'earbuds', [[/\bk2\b/i, 'headphones']]],
];

// For names no brand claims (or a brand that doesn't settle it).
const GENERIC = [
    [/speaker|\bsound ?bar\b|\bboom|soundbox|party|\bportable\b/i, 'speaker'],
    [/neck ?band|collar|\bsport ?wireless\b/i, 'neckband'],
    [/\bheadset\b|\bmic\b|gaming|\bcall\b/i, 'headset'],
    [/\bbuds?\b|pods\b|dots\b|\btws\b|earbuds?|\bearphones?\b|\bin-?ear\b|\bfree\b|\bbeans?\b|\bclip\b|\bopen\b|\bair ?\d/i, 'earbuds'],
    [/headphones?|\bover-?ear\b|\bon-?ear\b|\bmax\b/i, 'headphones'],
];

// UPower's kind, when the name says nothing.
const FROM_KIND = {
    'headset': 'headset',
    'headphones': 'headphones',
    'speakers': 'speaker',
    'other-audio': 'speaker',
};

export const SHAPE_LABELS = {
    earbuds: 'Earbuds',
    headphones: 'Headphones',
    headset: 'Headset',
    neckband: 'Neckband',
    speaker: 'Speaker',
};

// {brand: string|null, shape: one of SHAPE_LABELS' keys}
export function identify(name, kind) {
    name ??= '';
    const brand = BRANDS.find(([, re]) => re.test(name));
    const generic = GENERIC.find(([re]) => re.test(name))?.[1];
    if (brand) {
        const [title, , shape, models] = brand;
        // A brand's own model rules beat its default; the generic words only
        // override a default that clearly doesn't fit ("Sony speaker").
        const model = models.find(([re]) => re.test(name))?.[1];
        return {brand: title, shape: model ?? generic ?? shape};
    }
    return {brand: null, shape: generic ?? FROM_KIND[kind] ?? 'headphones'};
}

export const BRAND_COUNT = BRANDS.length;
