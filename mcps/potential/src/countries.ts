/**
 * Ülke girdisini (ISO2, ISO3, İngilizce veya Türkçe ad) Our World in Data'nın kullandığı
 * ISO 3166-1 alpha-3 koduna çevirir.
 */

const ISO2 =
  'AF:AFG AL:ALB DZ:DZA AD:AND AO:AGO AG:ATG AR:ARG AM:ARM AU:AUS AT:AUT AZ:AZE BS:BHS BH:BHR BD:BGD BB:BRB BY:BLR BE:BEL BZ:BLZ ' +
  'BJ:BEN BT:BTN BO:BOL BA:BIH BW:BWA BR:BRA BN:BRN BG:BGR BF:BFA BI:BDI CV:CPV KH:KHM CM:CMR CA:CAN CF:CAF TD:TCD CL:CHL CN:CHN ' +
  'CO:COL KM:COM CG:COG CD:COD CR:CRI CI:CIV HR:HRV CU:CUB CY:CYP CZ:CZE DK:DNK DJ:DJI DM:DMA DO:DOM EC:ECU EG:EGY SV:SLV GQ:GNQ ' +
  'ER:ERI EE:EST SZ:SWZ ET:ETH FJ:FJI FI:FIN FR:FRA GA:GAB GM:GMB GE:GEO DE:DEU GH:GHA GR:GRC GD:GRD GT:GTM GN:GIN GW:GNB GY:GUY ' +
  'HT:HTI HN:HND HK:HKG HU:HUN IS:ISL IN:IND ID:IDN IR:IRN IQ:IRQ IE:IRL IL:ISR IT:ITA JM:JAM JP:JPN JO:JOR KZ:KAZ KE:KEN KI:KIR ' +
  'KP:PRK KR:KOR XK:OWID_KOS KW:KWT KG:KGZ LA:LAO LV:LVA LB:LBN LS:LSO LR:LBR LY:LBY LI:LIE LT:LTU LU:LUX MO:MAC MG:MDG MW:MWI ' +
  'MY:MYS MV:MDV ML:MLI MT:MLT MH:MHL MR:MRT MU:MUS MX:MEX FM:FSM MD:MDA MC:MCO MN:MNG ME:MNE MA:MAR MZ:MOZ MM:MMR NA:NAM NR:NRU ' +
  'NP:NPL NL:NLD NZ:NZL NI:NIC NE:NER NG:NGA MK:MKD NO:NOR OM:OMN PK:PAK PW:PLW PS:PSE PA:PAN PG:PNG PY:PRY PE:PER PH:PHL PL:POL ' +
  'PT:PRT PR:PRI QA:QAT RO:ROU RU:RUS RW:RWA KN:KNA LC:LCA VC:VCT WS:WSM SM:SMR ST:STP SA:SAU SN:SEN RS:SRB SC:SYC SL:SLE SG:SGP ' +
  'SK:SVK SI:SVN SB:SLB SO:SOM ZA:ZAF SS:SSD ES:ESP LK:LKA SD:SDN SR:SUR SE:SWE CH:CHE SY:SYR TW:TWN TJ:TJK TZ:TZA TH:THA TL:TLS ' +
  'TG:TGO TO:TON TT:TTO TN:TUN TR:TUR TM:TKM TV:TUV UG:UGA UA:UKR AE:ARE GB:GBR UK:GBR US:USA UY:URY UZ:UZB VU:VUT VA:VAT VE:VEN ' +
  'VN:VNM YE:YEM ZM:ZMB ZW:ZWE';

const ISO2_TO_3 = new Map(ISO2.split(' ').map((p) => p.split(':') as [string, string]));

/** Türkçe ve yaygın kısa adlar → ISO3 */
const NAMES: Record<string, string> = {
  türkiye: 'TUR', turkiye: 'TUR', türkei: 'TUR', turkey: 'TUR',
  almanya: 'DEU', 'abd': 'USA', amerika: 'USA', 'amerika birleşik devletleri': 'USA', usa: 'USA', 'united states of america': 'USA',
  ingiltere: 'GBR', 'birleşik krallık': 'GBR', uk: 'GBR', britain: 'GBR', 'great britain': 'GBR',
  fransa: 'FRA', italya: 'ITA', ispanya: 'ESP', hollanda: 'NLD', belçika: 'BEL', isviçre: 'CHE', avusturya: 'AUT', isveç: 'SWE',
  norveç: 'NOR', danimarka: 'DNK', finlandiya: 'FIN', polonya: 'POL', yunanistan: 'GRC', bulgaristan: 'BGR', romanya: 'ROU',
  macaristan: 'HUN', çekya: 'CZE', 'çek cumhuriyeti': 'CZE', portekiz: 'PRT', irlanda: 'IRL', rusya: 'RUS', ukrayna: 'UKR',
  azerbaycan: 'AZE', gürcistan: 'GEO', ermenistan: 'ARM', kazakistan: 'KAZ', özbekistan: 'UZB', türkmenistan: 'TKM',
  kırgızistan: 'KGZ', tacikistan: 'TJK', çin: 'CHN', japonya: 'JPN', 'güney kore': 'KOR', kore: 'KOR', hindistan: 'IND',
  endonezya: 'IDN', pakistan: 'PAK', bangladeş: 'BGD', 'suudi arabistan': 'SAU', 'birleşik arap emirlikleri': 'ARE', bae: 'ARE',
  uae: 'ARE', katar: 'QAT', kuveyt: 'KWT', bahreyn: 'BHR', umman: 'OMN', irak: 'IRQ', iran: 'IRN', ürdün: 'JOR', lübnan: 'LBN',
  israil: 'ISR', mısır: 'EGY', fas: 'MAR', cezayir: 'DZA', tunus: 'TUN', libya: 'LBY', nijerya: 'NGA', 'güney afrika': 'ZAF',
  kenya: 'KEN', brezilya: 'BRA', meksika: 'MEX', arjantin: 'ARG', kanada: 'CAN', avustralya: 'AUS', kolombiya: 'COL', şili: 'CHL',
  malezya: 'MYS', tayland: 'THA', vietnam: 'VNM', filipinler: 'PHL', singapur: 'SGP', 'yeni zelanda': 'NZL', sırbistan: 'SRB',
  'bosna hersek': 'BIH', arnavutluk: 'ALB', kosova: 'OWID_KOS', kıbrıs: 'CYP', 'kuzey makedonya': 'MKD', karadağ: 'MNE',
  hırvatistan: 'HRV', slovenya: 'SVN', slovakya: 'SVK', estonya: 'EST', letonya: 'LVA', litvanya: 'LTU', moldova: 'MDA',
  belarus: 'BLR', 'beyaz rusya': 'BLR', moğolistan: 'MNG', afganistan: 'AFG', suriye: 'SYR', yemen: 'YEM', sudan: 'SDN',
  etiyopya: 'ETH', gana: 'GHA', senegal: 'SEN', tanzanya: 'TZA', uganda: 'UGA', peru: 'PER', venezuela: 'VEN', ekvador: 'ECU',
  uruguay: 'URY', paraguay: 'PRY', bolivya: 'BOL', küba: 'CUB', tayvan: 'TWN', 'hong kong': 'HKG', izlanda: 'ISL', lüksemburg: 'LUX',
  malta: 'MLT',
};

const ISO3_TO_2 = new Map([...ISO2_TO_3.entries()].filter(([two]) => two !== 'UK').map(([two, three]) => [three, two]));

/** Ülke adını arayüz dilinde verir (örn. TUR → "Türkiye" / "Türkiye", DEU → "Almanya" / "Germany"). */
export function countryLabel(code: string, lang: 'tr' | 'en', fallback: string): string {
  const two = ISO3_TO_2.get(code);
  if (!two || two === 'XK') return fallback;
  try {
    return new Intl.DisplayNames([lang === 'tr' ? 'tr-TR' : 'en-US'], { type: 'region' }).of(two) ?? fallback;
  } catch {
    return fallback;
  }
}

export function normalizeName(s: string): string {
  return s.trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');
}

/** entityNames: OWID verisindeki ad → kod eşlemesi (İngilizce adlarla eşleşme için) */
export function resolveCountry(input: string, entityNames: Map<string, string>): string | null {
  const raw = input.trim();
  if (/^[A-Za-z]{3}$/.test(raw)) {
    const code = raw.toUpperCase();
    return [...entityNames.values()].includes(code) ? code : null;
  }
  if (/^[A-Za-z]{2}$/.test(raw)) return ISO2_TO_3.get(raw.toUpperCase()) ?? null;
  const key = normalizeName(raw);
  if (NAMES[key]) return NAMES[key];
  for (const [name, code] of entityNames) if (normalizeName(name) === key) return code;
  return null;
}
