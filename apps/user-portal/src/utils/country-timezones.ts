// Mapping of country codes to their timezones with detailed information
// Based on IANA timezone database

export interface TimezoneInfo {
  timezone: string; // IANA timezone identifier (e.g., "America/New_York")
  displayName: string; // User-friendly display name (e.g., "Eastern Time (New York)")
  shortName: string; // Short abbreviation (e.g., "ET", "EST", "EDT")
  utcOffset: string; // Standard UTC offset (e.g., "-05:00")
  utcOffsetDst: string; // UTC offset during DST (e.g., "-04:00")
  observesDst: boolean; // Whether this timezone observes Daylight Saving Time
  majorCities: string[]; // Major cities in this timezone
  region: string; // Geographic region (e.g., "North America", "Europe")
}

export interface CountryTimezoneData {
  countryCode: string;
  countryName: string;
  timezones: TimezoneInfo[];
}

// Detailed timezone information by country
export const countryTimezoneDetails: Record<string, CountryTimezoneData> = {
  ZA: {
    countryCode: "ZA",
    countryName: "South Africa",
    timezones: [
      {
        timezone: "Africa/Johannesburg",
        displayName: "South Africa Standard Time (Johannesburg)",
        shortName: "SAST",
        utcOffset: "+02:00",
        utcOffsetDst: "+02:00",
        observesDst: false,
        majorCities: ["Johannesburg", "Cape Town", "Durban", "Pretoria"],
        region: "Africa",
      },
    ],
  },
  US: {
    countryCode: "US",
    countryName: "United States",
    timezones: [
      {
        timezone: "America/New_York",
        displayName: "Eastern Time (New York)",
        shortName: "ET",
        utcOffset: "-05:00",
        utcOffsetDst: "-04:00",
        observesDst: true,
        majorCities: ["New York", "Miami", "Boston", "Washington DC", "Atlanta"],
        region: "North America",
      },
      {
        timezone: "America/Chicago",
        displayName: "Central Time (Chicago)",
        shortName: "CT",
        utcOffset: "-06:00",
        utcOffsetDst: "-05:00",
        observesDst: true,
        majorCities: ["Chicago", "Dallas", "Houston", "Minneapolis", "New Orleans"],
        region: "North America",
      },
      {
        timezone: "America/Denver",
        displayName: "Mountain Time (Denver)",
        shortName: "MT",
        utcOffset: "-07:00",
        utcOffsetDst: "-06:00",
        observesDst: true,
        majorCities: ["Denver", "Phoenix", "Salt Lake City", "Albuquerque"],
        region: "North America",
      },
      {
        timezone: "America/Los_Angeles",
        displayName: "Pacific Time (Los Angeles)",
        shortName: "PT",
        utcOffset: "-08:00",
        utcOffsetDst: "-07:00",
        observesDst: true,
        majorCities: ["Los Angeles", "San Francisco", "Seattle", "San Diego", "Las Vegas"],
        region: "North America",
      },
      {
        timezone: "America/Phoenix",
        displayName: "Mountain Standard Time (Phoenix)",
        shortName: "MST",
        utcOffset: "-07:00",
        utcOffsetDst: "-07:00",
        observesDst: false,
        majorCities: ["Phoenix", "Tucson"],
        region: "North America",
      },
      {
        timezone: "America/Anchorage",
        displayName: "Alaska Time (Anchorage)",
        shortName: "AKT",
        utcOffset: "-09:00",
        utcOffsetDst: "-08:00",
        observesDst: true,
        majorCities: ["Anchorage", "Fairbanks", "Juneau"],
        region: "North America",
      },
      {
        timezone: "Pacific/Honolulu",
        displayName: "Hawaii-Aleutian Time (Honolulu)",
        shortName: "HST",
        utcOffset: "-10:00",
        utcOffsetDst: "-10:00",
        observesDst: false,
        majorCities: ["Honolulu"],
        region: "Pacific",
      },
    ],
  },
  GB: {
    countryCode: "GB",
    countryName: "United Kingdom",
    timezones: [
      {
        timezone: "Europe/London",
        displayName: "Greenwich Mean Time (London)",
        shortName: "GMT",
        utcOffset: "+00:00",
        utcOffsetDst: "+01:00",
        observesDst: true,
        majorCities: ["London", "Birmingham", "Manchester", "Liverpool", "Leeds"],
        region: "Europe",
      },
    ],
  },
  CA: {
    countryCode: "CA",
    countryName: "Canada",
    timezones: [
      {
        timezone: "America/Toronto",
        displayName: "Eastern Time (Toronto)",
        shortName: "ET",
        utcOffset: "-05:00",
        utcOffsetDst: "-04:00",
        observesDst: true,
        majorCities: ["Toronto", "Ottawa", "Montreal", "Quebec City"],
        region: "North America",
      },
      {
        timezone: "America/Vancouver",
        displayName: "Pacific Time (Vancouver)",
        shortName: "PT",
        utcOffset: "-08:00",
        utcOffsetDst: "-07:00",
        observesDst: true,
        majorCities: ["Vancouver", "Victoria"],
        region: "North America",
      },
      {
        timezone: "America/Edmonton",
        displayName: "Mountain Time (Edmonton)",
        shortName: "MT",
        utcOffset: "-07:00",
        utcOffsetDst: "-06:00",
        observesDst: true,
        majorCities: ["Edmonton", "Calgary"],
        region: "North America",
      },
      {
        timezone: "America/Winnipeg",
        displayName: "Central Time (Winnipeg)",
        shortName: "CT",
        utcOffset: "-06:00",
        utcOffsetDst: "-05:00",
        observesDst: true,
        majorCities: ["Winnipeg"],
        region: "North America",
      },
      {
        timezone: "America/Halifax",
        displayName: "Atlantic Time (Halifax)",
        shortName: "AT",
        utcOffset: "-04:00",
        utcOffsetDst: "-03:00",
        observesDst: true,
        majorCities: ["Halifax", "Moncton"],
        region: "North America",
      },
      {
        timezone: "America/St_Johns",
        displayName: "Newfoundland Time (St. John's)",
        shortName: "NT",
        utcOffset: "-03:30",
        utcOffsetDst: "-02:30",
        observesDst: true,
        majorCities: ["St. John's"],
        region: "North America",
      },
    ],
  },
  AU: {
    countryCode: "AU",
    countryName: "Australia",
    timezones: [
      {
        timezone: "Australia/Sydney",
        displayName: "Australian Eastern Time (Sydney)",
        shortName: "AET",
        utcOffset: "+10:00",
        utcOffsetDst: "+11:00",
        observesDst: true,
        majorCities: ["Sydney", "Melbourne", "Canberra"],
        region: "Oceania",
      },
      {
        timezone: "Australia/Melbourne",
        displayName: "Australian Eastern Time (Melbourne)",
        shortName: "AET",
        utcOffset: "+10:00",
        utcOffsetDst: "+11:00",
        observesDst: true,
        majorCities: ["Melbourne"],
        region: "Oceania",
      },
      {
        timezone: "Australia/Brisbane",
        displayName: "Australian Eastern Standard Time (Brisbane)",
        shortName: "AEST",
        utcOffset: "+10:00",
        utcOffsetDst: "+10:00",
        observesDst: false,
        majorCities: ["Brisbane", "Gold Coast"],
        region: "Oceania",
      },
      {
        timezone: "Australia/Perth",
        displayName: "Australian Western Standard Time (Perth)",
        shortName: "AWST",
        utcOffset: "+08:00",
        utcOffsetDst: "+08:00",
        observesDst: false,
        majorCities: ["Perth"],
        region: "Oceania",
      },
      {
        timezone: "Australia/Adelaide",
        displayName: "Australian Central Time (Adelaide)",
        shortName: "ACT",
        utcOffset: "+09:30",
        utcOffsetDst: "+10:30",
        observesDst: true,
        majorCities: ["Adelaide"],
        region: "Oceania",
      },
      {
        timezone: "Australia/Darwin",
        displayName: "Australian Central Standard Time (Darwin)",
        shortName: "ACST",
        utcOffset: "+09:30",
        utcOffsetDst: "+09:30",
        observesDst: false,
        majorCities: ["Darwin"],
        region: "Oceania",
      },
      {
        timezone: "Australia/Hobart",
        displayName: "Australian Eastern Time (Hobart)",
        shortName: "AET",
        utcOffset: "+10:00",
        utcOffsetDst: "+11:00",
        observesDst: true,
        majorCities: ["Hobart"],
        region: "Oceania",
      },
    ],
  },
  NZ: {
    countryCode: "NZ",
    countryName: "New Zealand",
    timezones: [
      {
        timezone: "Pacific/Auckland",
        displayName: "New Zealand Time (Auckland)",
        shortName: "NZST",
        utcOffset: "+12:00",
        utcOffsetDst: "+13:00",
        observesDst: true,
        majorCities: ["Auckland", "Wellington", "Christchurch"],
        region: "Oceania",
      },
      {
        timezone: "Pacific/Chatham",
        displayName: "Chatham Time",
        shortName: "CHAST",
        utcOffset: "+12:45",
        utcOffsetDst: "+13:45",
        observesDst: true,
        majorCities: ["Chatham Islands"],
        region: "Oceania",
      },
    ],
  },
  IN: {
    countryCode: "IN",
    countryName: "India",
    timezones: [
      {
        timezone: "Asia/Kolkata",
        displayName: "India Standard Time (Kolkata)",
        shortName: "IST",
        utcOffset: "+05:30",
        utcOffsetDst: "+05:30",
        observesDst: false,
        majorCities: ["Mumbai", "Delhi", "Bangalore", "Kolkata", "Chennai", "Hyderabad"],
        region: "Asia",
      },
    ],
  },
  CN: {
    countryCode: "CN",
    countryName: "China",
    timezones: [
      {
        timezone: "Asia/Shanghai",
        displayName: "China Standard Time (Shanghai)",
        shortName: "CST",
        utcOffset: "+08:00",
        utcOffsetDst: "+08:00",
        observesDst: false,
        majorCities: ["Shanghai", "Beijing", "Guangzhou", "Shenzhen", "Chengdu"],
        region: "Asia",
      },
    ],
  },
  JP: {
    countryCode: "JP",
    countryName: "Japan",
    timezones: [
      {
        timezone: "Asia/Tokyo",
        displayName: "Japan Standard Time (Tokyo)",
        shortName: "JST",
        utcOffset: "+09:00",
        utcOffsetDst: "+09:00",
        observesDst: false,
        majorCities: ["Tokyo", "Osaka", "Yokohama", "Kyoto", "Nagoya"],
        region: "Asia",
      },
    ],
  },
  KR: {
    countryCode: "KR",
    countryName: "South Korea",
    timezones: [
      {
        timezone: "Asia/Seoul",
        displayName: "Korea Standard Time (Seoul)",
        shortName: "KST",
        utcOffset: "+09:00",
        utcOffsetDst: "+09:00",
        observesDst: false,
        majorCities: ["Seoul", "Busan", "Incheon", "Daegu"],
        region: "Asia",
      },
    ],
  },
  SG: {
    countryCode: "SG",
    countryName: "Singapore",
    timezones: [
      {
        timezone: "Asia/Singapore",
        displayName: "Singapore Standard Time",
        shortName: "SGT",
        utcOffset: "+08:00",
        utcOffsetDst: "+08:00",
        observesDst: false,
        majorCities: ["Singapore"],
        region: "Asia",
      },
    ],
  },
  MY: {
    countryCode: "MY",
    countryName: "Malaysia",
    timezones: [
      {
        timezone: "Asia/Kuala_Lumpur",
        displayName: "Malaysia Time (Kuala Lumpur)",
        shortName: "MYT",
        utcOffset: "+08:00",
        utcOffsetDst: "+08:00",
        observesDst: false,
        majorCities: ["Kuala Lumpur", "Penang", "Johor Bahru"],
        region: "Asia",
      },
    ],
  },
  TH: {
    countryCode: "TH",
    countryName: "Thailand",
    timezones: [
      {
        timezone: "Asia/Bangkok",
        displayName: "Indochina Time (Bangkok)",
        shortName: "ICT",
        utcOffset: "+07:00",
        utcOffsetDst: "+07:00",
        observesDst: false,
        majorCities: ["Bangkok", "Chiang Mai", "Pattaya"],
        region: "Asia",
      },
    ],
  },
  PH: {
    countryCode: "PH",
    countryName: "Philippines",
    timezones: [
      {
        timezone: "Asia/Manila",
        displayName: "Philippine Time (Manila)",
        shortName: "PHT",
        utcOffset: "+08:00",
        utcOffsetDst: "+08:00",
        observesDst: false,
        majorCities: ["Manila", "Cebu", "Davao"],
        region: "Asia",
      },
    ],
  },
  ID: {
    countryCode: "ID",
    countryName: "Indonesia",
    timezones: [
      {
        timezone: "Asia/Jakarta",
        displayName: "Western Indonesia Time (Jakarta)",
        shortName: "WIB",
        utcOffset: "+07:00",
        utcOffsetDst: "+07:00",
        observesDst: false,
        majorCities: ["Jakarta", "Bandung", "Surabaya"],
        region: "Asia",
      },
      {
        timezone: "Asia/Makassar",
        displayName: "Central Indonesia Time (Makassar)",
        shortName: "WITA",
        utcOffset: "+08:00",
        utcOffsetDst: "+08:00",
        observesDst: false,
        majorCities: ["Makassar", "Balikpapan"],
        region: "Asia",
      },
      {
        timezone: "Asia/Jayapura",
        displayName: "Eastern Indonesia Time (Jayapura)",
        shortName: "WIT",
        utcOffset: "+09:00",
        utcOffsetDst: "+09:00",
        observesDst: false,
        majorCities: ["Jayapura"],
        region: "Asia",
      },
    ],
  },
  VN: {
    countryCode: "VN",
    countryName: "Vietnam",
    timezones: [
      {
        timezone: "Asia/Ho_Chi_Minh",
        displayName: "Indochina Time (Ho Chi Minh City)",
        shortName: "ICT",
        utcOffset: "+07:00",
        utcOffsetDst: "+07:00",
        observesDst: false,
        majorCities: ["Ho Chi Minh City", "Hanoi", "Da Nang"],
        region: "Asia",
      },
    ],
  },
  AE: {
    countryCode: "AE",
    countryName: "United Arab Emirates",
    timezones: [
      {
        timezone: "Asia/Dubai",
        displayName: "Gulf Standard Time (Dubai)",
        shortName: "GST",
        utcOffset: "+04:00",
        utcOffsetDst: "+04:00",
        observesDst: false,
        majorCities: ["Dubai", "Abu Dhabi", "Sharjah"],
        region: "Asia",
      },
    ],
  },
  SA: {
    countryCode: "SA",
    countryName: "Saudi Arabia",
    timezones: [
      {
        timezone: "Asia/Riyadh",
        displayName: "Arabia Standard Time (Riyadh)",
        shortName: "AST",
        utcOffset: "+03:00",
        utcOffsetDst: "+03:00",
        observesDst: false,
        majorCities: ["Riyadh", "Jeddah", "Mecca", "Medina"],
        region: "Asia",
      },
    ],
  },
  IL: {
    countryCode: "IL",
    countryName: "Israel",
    timezones: [
      {
        timezone: "Asia/Jerusalem",
        displayName: "Israel Standard Time (Jerusalem)",
        shortName: "IST",
        utcOffset: "+02:00",
        utcOffsetDst: "+03:00",
        observesDst: true,
        majorCities: ["Jerusalem", "Tel Aviv", "Haifa"],
        region: "Asia",
      },
    ],
  },
  EG: {
    countryCode: "EG",
    countryName: "Egypt",
    timezones: [
      {
        timezone: "Africa/Cairo",
        displayName: "Eastern European Time (Cairo)",
        shortName: "EET",
        utcOffset: "+02:00",
        utcOffsetDst: "+02:00",
        observesDst: false,
        majorCities: ["Cairo", "Alexandria", "Giza"],
        region: "Africa",
      },
    ],
  },
  RU: {
    countryCode: "RU",
    countryName: "Russia",
    timezones: [
      {
        timezone: "Europe/Moscow",
        displayName: "Moscow Standard Time",
        shortName: "MSK",
        utcOffset: "+03:00",
        utcOffsetDst: "+03:00",
        observesDst: false,
        majorCities: ["Moscow", "Saint Petersburg", "Novosibirsk"],
        region: "Europe/Asia",
      },
      {
        timezone: "Asia/Yekaterinburg",
        displayName: "Yekaterinburg Time",
        shortName: "YEKT",
        utcOffset: "+05:00",
        utcOffsetDst: "+05:00",
        observesDst: false,
        majorCities: ["Yekaterinburg"],
        region: "Asia",
      },
      {
        timezone: "Asia/Novosibirsk",
        displayName: "Novosibirsk Time",
        shortName: "NOVT",
        utcOffset: "+07:00",
        utcOffsetDst: "+07:00",
        observesDst: false,
        majorCities: ["Novosibirsk"],
        region: "Asia",
      },
      {
        timezone: "Asia/Krasnoyarsk",
        displayName: "Krasnoyarsk Time",
        shortName: "KRAT",
        utcOffset: "+07:00",
        utcOffsetDst: "+07:00",
        observesDst: false,
        majorCities: ["Krasnoyarsk"],
        region: "Asia",
      },
      {
        timezone: "Asia/Irkutsk",
        displayName: "Irkutsk Time",
        shortName: "IRKT",
        utcOffset: "+08:00",
        utcOffsetDst: "+08:00",
        observesDst: false,
        majorCities: ["Irkutsk"],
        region: "Asia",
      },
      {
        timezone: "Asia/Yakutsk",
        displayName: "Yakutsk Time",
        shortName: "YAKT",
        utcOffset: "+09:00",
        utcOffsetDst: "+09:00",
        observesDst: false,
        majorCities: ["Yakutsk"],
        region: "Asia",
      },
      {
        timezone: "Asia/Vladivostok",
        displayName: "Vladivostok Time",
        shortName: "VLAT",
        utcOffset: "+10:00",
        utcOffsetDst: "+10:00",
        observesDst: false,
        majorCities: ["Vladivostok"],
        region: "Asia",
      },
      {
        timezone: "Asia/Magadan",
        displayName: "Magadan Time",
        shortName: "MAGT",
        utcOffset: "+11:00",
        utcOffsetDst: "+11:00",
        observesDst: false,
        majorCities: ["Magadan"],
        region: "Asia",
      },
      {
        timezone: "Asia/Kamchatka",
        displayName: "Kamchatka Time",
        shortName: "PETT",
        utcOffset: "+12:00",
        utcOffsetDst: "+12:00",
        observesDst: false,
        majorCities: ["Petropavlovsk-Kamchatsky"],
        region: "Asia",
      },
    ],
  },
  TR: {
    countryCode: "TR",
    countryName: "Turkey",
    timezones: [
      {
        timezone: "Europe/Istanbul",
        displayName: "Turkey Time (Istanbul)",
        shortName: "TRT",
        utcOffset: "+03:00",
        utcOffsetDst: "+03:00",
        observesDst: false,
        majorCities: ["Istanbul", "Ankara", "Izmir"],
        region: "Europe/Asia",
      },
    ],
  },
  DE: {
    countryCode: "DE",
    countryName: "Germany",
    timezones: [
      {
        timezone: "Europe/Berlin",
        displayName: "Central European Time (Berlin)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+02:00",
        observesDst: true,
        majorCities: ["Berlin", "Munich", "Hamburg", "Frankfurt", "Cologne"],
        region: "Europe",
      },
    ],
  },
  FR: {
    countryCode: "FR",
    countryName: "France",
    timezones: [
      {
        timezone: "Europe/Paris",
        displayName: "Central European Time (Paris)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+02:00",
        observesDst: true,
        majorCities: ["Paris", "Lyon", "Marseille", "Toulouse"],
        region: "Europe",
      },
    ],
  },
  IT: {
    countryCode: "IT",
    countryName: "Italy",
    timezones: [
      {
        timezone: "Europe/Rome",
        displayName: "Central European Time (Rome)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+02:00",
        observesDst: true,
        majorCities: ["Rome", "Milan", "Naples", "Turin"],
        region: "Europe",
      },
    ],
  },
  ES: {
    countryCode: "ES",
    countryName: "Spain",
    timezones: [
      {
        timezone: "Europe/Madrid",
        displayName: "Central European Time (Madrid)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+02:00",
        observesDst: true,
        majorCities: ["Madrid", "Barcelona", "Valencia", "Seville"],
        region: "Europe",
      },
    ],
  },
  NL: {
    countryCode: "NL",
    countryName: "Netherlands",
    timezones: [
      {
        timezone: "Europe/Amsterdam",
        displayName: "Central European Time (Amsterdam)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+02:00",
        observesDst: true,
        majorCities: ["Amsterdam", "Rotterdam", "The Hague", "Utrecht"],
        region: "Europe",
      },
    ],
  },
  BE: {
    countryCode: "BE",
    countryName: "Belgium",
    timezones: [
      {
        timezone: "Europe/Brussels",
        displayName: "Central European Time (Brussels)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+02:00",
        observesDst: true,
        majorCities: ["Brussels", "Antwerp", "Ghent"],
        region: "Europe",
      },
    ],
  },
  SE: {
    countryCode: "SE",
    countryName: "Sweden",
    timezones: [
      {
        timezone: "Europe/Stockholm",
        displayName: "Central European Time (Stockholm)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+02:00",
        observesDst: true,
        majorCities: ["Stockholm", "Gothenburg", "Malmö"],
        region: "Europe",
      },
    ],
  },
  NO: {
    countryCode: "NO",
    countryName: "Norway",
    timezones: [
      {
        timezone: "Europe/Oslo",
        displayName: "Central European Time (Oslo)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+02:00",
        observesDst: true,
        majorCities: ["Oslo", "Bergen", "Trondheim"],
        region: "Europe",
      },
    ],
  },
  DK: {
    countryCode: "DK",
    countryName: "Denmark",
    timezones: [
      {
        timezone: "Europe/Copenhagen",
        displayName: "Central European Time (Copenhagen)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+02:00",
        observesDst: true,
        majorCities: ["Copenhagen", "Aarhus", "Odense"],
        region: "Europe",
      },
    ],
  },
  FI: {
    countryCode: "FI",
    countryName: "Finland",
    timezones: [
      {
        timezone: "Europe/Helsinki",
        displayName: "Eastern European Time (Helsinki)",
        shortName: "EET",
        utcOffset: "+02:00",
        utcOffsetDst: "+03:00",
        observesDst: true,
        majorCities: ["Helsinki", "Espoo", "Tampere"],
        region: "Europe",
      },
    ],
  },
  PT: {
    countryCode: "PT",
    countryName: "Portugal",
    timezones: [
      {
        timezone: "Europe/Lisbon",
        displayName: "Western European Time (Lisbon)",
        shortName: "WET",
        utcOffset: "+00:00",
        utcOffsetDst: "+01:00",
        observesDst: true,
        majorCities: ["Lisbon", "Porto", "Braga"],
        region: "Europe",
      },
      {
        timezone: "Atlantic/Azores",
        displayName: "Azores Time",
        shortName: "AZOT",
        utcOffset: "-01:00",
        utcOffsetDst: "+00:00",
        observesDst: true,
        majorCities: ["Ponta Delgada"],
        region: "Atlantic",
      },
    ],
  },
  CH: {
    countryCode: "CH",
    countryName: "Switzerland",
    timezones: [
      {
        timezone: "Europe/Zurich",
        displayName: "Central European Time (Zurich)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+02:00",
        observesDst: true,
        majorCities: ["Zurich", "Geneva", "Basel", "Bern"],
        region: "Europe",
      },
    ],
  },
  AT: {
    countryCode: "AT",
    countryName: "Austria",
    timezones: [
      {
        timezone: "Europe/Vienna",
        displayName: "Central European Time (Vienna)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+02:00",
        observesDst: true,
        majorCities: ["Vienna", "Graz", "Linz"],
        region: "Europe",
      },
    ],
  },
  BR: {
    countryCode: "BR",
    countryName: "Brazil",
    timezones: [
      {
        timezone: "America/Sao_Paulo",
        displayName: "Brasília Time (São Paulo)",
        shortName: "BRT",
        utcOffset: "-03:00",
        utcOffsetDst: "-02:00",
        observesDst: false,
        majorCities: ["São Paulo", "Rio de Janeiro", "Brasília", "Belo Horizonte"],
        region: "South America",
      },
      {
        timezone: "America/Manaus",
        displayName: "Amazon Time (Manaus)",
        shortName: "AMT",
        utcOffset: "-04:00",
        utcOffsetDst: "-04:00",
        observesDst: false,
        majorCities: ["Manaus"],
        region: "South America",
      },
      {
        timezone: "America/Fortaleza",
        displayName: "Brasília Time (Fortaleza)",
        shortName: "BRT",
        utcOffset: "-03:00",
        utcOffsetDst: "-03:00",
        observesDst: false,
        majorCities: ["Fortaleza", "Recife", "Salvador"],
        region: "South America",
      },
      {
        timezone: "America/Recife",
        displayName: "Brasília Time (Recife)",
        shortName: "BRT",
        utcOffset: "-03:00",
        utcOffsetDst: "-03:00",
        observesDst: false,
        majorCities: ["Recife"],
        region: "South America",
      },
      {
        timezone: "America/Belem",
        displayName: "Brasília Time (Belém)",
        shortName: "BRT",
        utcOffset: "-03:00",
        utcOffsetDst: "-03:00",
        observesDst: false,
        majorCities: ["Belém"],
        region: "South America",
      },
    ],
  },
  MX: {
    countryCode: "MX",
    countryName: "Mexico",
    timezones: [
      {
        timezone: "America/Mexico_City",
        displayName: "Central Time (Mexico City)",
        shortName: "CST",
        utcOffset: "-06:00",
        utcOffsetDst: "-05:00",
        observesDst: true,
        majorCities: ["Mexico City", "Guadalajara", "Monterrey"],
        region: "North America",
      },
      {
        timezone: "America/Tijuana",
        displayName: "Pacific Time (Tijuana)",
        shortName: "PST",
        utcOffset: "-08:00",
        utcOffsetDst: "-07:00",
        observesDst: true,
        majorCities: ["Tijuana"],
        region: "North America",
      },
      {
        timezone: "America/Mazatlan",
        displayName: "Mountain Time (Mazatlan)",
        shortName: "MST",
        utcOffset: "-07:00",
        utcOffsetDst: "-06:00",
        observesDst: true,
        majorCities: ["Mazatlan"],
        region: "North America",
      },
      {
        timezone: "America/Merida",
        displayName: "Central Time (Merida)",
        shortName: "CST",
        utcOffset: "-06:00",
        utcOffsetDst: "-05:00",
        observesDst: true,
        majorCities: ["Merida"],
        region: "North America",
      },
      {
        timezone: "America/Monterrey",
        displayName: "Central Time (Monterrey)",
        shortName: "CST",
        utcOffset: "-06:00",
        utcOffsetDst: "-05:00",
        observesDst: true,
        majorCities: ["Monterrey"],
        region: "North America",
      },
    ],
  },
  AR: {
    countryCode: "AR",
    countryName: "Argentina",
    timezones: [
      {
        timezone: "America/Argentina/Buenos_Aires",
        displayName: "Argentina Time (Buenos Aires)",
        shortName: "ART",
        utcOffset: "-03:00",
        utcOffsetDst: "-03:00",
        observesDst: false,
        majorCities: ["Buenos Aires", "Córdoba", "Rosario"],
        region: "South America",
      },
    ],
  },
  CL: {
    countryCode: "CL",
    countryName: "Chile",
    timezones: [
      {
        timezone: "America/Santiago",
        displayName: "Chile Time (Santiago)",
        shortName: "CLT",
        utcOffset: "-04:00",
        utcOffsetDst: "-03:00",
        observesDst: true,
        majorCities: ["Santiago", "Valparaíso"],
        region: "South America",
      },
    ],
  },
  CO: {
    countryCode: "CO",
    countryName: "Colombia",
    timezones: [
      {
        timezone: "America/Bogota",
        displayName: "Colombia Time (Bogotá)",
        shortName: "COT",
        utcOffset: "-05:00",
        utcOffsetDst: "-05:00",
        observesDst: false,
        majorCities: ["Bogotá", "Medellín", "Cali"],
        region: "South America",
      },
    ],
  },
  PK: {
    countryCode: "PK",
    countryName: "Pakistan",
    timezones: [
      {
        timezone: "Asia/Karachi",
        displayName: "Pakistan Standard Time (Karachi)",
        shortName: "PKT",
        utcOffset: "+05:00",
        utcOffsetDst: "+05:00",
        observesDst: false,
        majorCities: ["Karachi", "Lahore", "Islamabad"],
        region: "Asia",
      },
    ],
  },
  NG: {
    countryCode: "NG",
    countryName: "Nigeria",
    timezones: [
      {
        timezone: "Africa/Lagos",
        displayName: "West Africa Time (Lagos)",
        shortName: "WAT",
        utcOffset: "+01:00",
        utcOffsetDst: "+01:00",
        observesDst: false,
        majorCities: ["Lagos", "Abuja", "Kano"],
        region: "Africa",
      },
    ],
  },
  KE: {
    countryCode: "KE",
    countryName: "Kenya",
    timezones: [
      {
        timezone: "Africa/Nairobi",
        displayName: "East Africa Time (Nairobi)",
        shortName: "EAT",
        utcOffset: "+03:00",
        utcOffsetDst: "+03:00",
        observesDst: false,
        majorCities: ["Nairobi", "Mombasa", "Kisumu"],
        region: "Africa",
      },
    ],
  },
  GH: {
    countryCode: "GH",
    countryName: "Ghana",
    timezones: [
      {
        timezone: "Africa/Accra",
        displayName: "Greenwich Mean Time (Accra)",
        shortName: "GMT",
        utcOffset: "+00:00",
        utcOffsetDst: "+00:00",
        observesDst: false,
        majorCities: ["Accra", "Kumasi"],
        region: "Africa",
      },
    ],
  },
  ZW: {
    countryCode: "ZW",
    countryName: "Zimbabwe",
    timezones: [
      {
        timezone: "Africa/Harare",
        displayName: "Central Africa Time (Harare)",
        shortName: "CAT",
        utcOffset: "+02:00",
        utcOffsetDst: "+02:00",
        observesDst: false,
        majorCities: ["Harare", "Bulawayo"],
        region: "Africa",
      },
    ],
  },
  BW: {
    countryCode: "BW",
    countryName: "Botswana",
    timezones: [
      {
        timezone: "Africa/Gaborone",
        displayName: "Central Africa Time (Gaborone)",
        shortName: "CAT",
        utcOffset: "+02:00",
        utcOffsetDst: "+02:00",
        observesDst: false,
        majorCities: ["Gaborone"],
        region: "Africa",
      },
    ],
  },
  NA: {
    countryCode: "NA",
    countryName: "Namibia",
    timezones: [
      {
        timezone: "Africa/Windhoek",
        displayName: "Central Africa Time (Windhoek)",
        shortName: "CAT",
        utcOffset: "+02:00",
        utcOffsetDst: "+02:00",
        observesDst: false,
        majorCities: ["Windhoek"],
        region: "Africa",
      },
    ],
  },
  IE: {
    countryCode: "IE",
    countryName: "Ireland",
    timezones: [
      {
        timezone: "Europe/Dublin",
        displayName: "Greenwich Mean Time (Dublin)",
        shortName: "GMT",
        utcOffset: "+00:00",
        utcOffsetDst: "+01:00",
        observesDst: true,
        majorCities: ["Dublin", "Cork", "Limerick"],
        region: "Europe",
      },
    ],
  },
  UA: {
    countryCode: "UA",
    countryName: "Ukraine",
    timezones: [
      {
        timezone: "Europe/Kyiv",
        displayName: "Eastern European Time (Kyiv)",
        shortName: "EET",
        utcOffset: "+02:00",
        utcOffsetDst: "+03:00",
        observesDst: true,
        majorCities: ["Kyiv", "Kharkiv", "Odesa", "Dnipro", "Donetsk"],
        region: "Europe",
      },
    ],
  },
  PL: {
    countryCode: "PL",
    countryName: "Poland",
    timezones: [
      {
        timezone: "Europe/Warsaw",
        displayName: "Central European Time (Warsaw)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+02:00",
        observesDst: true,
        majorCities: ["Warsaw", "Kraków", "Gdańsk", "Wrocław", "Poznań"],
        region: "Europe",
      },
    ],
  },
  GR: {
    countryCode: "GR",
    countryName: "Greece",
    timezones: [
      {
        timezone: "Europe/Athens",
        displayName: "Eastern European Time (Athens)",
        shortName: "EET",
        utcOffset: "+02:00",
        utcOffsetDst: "+03:00",
        observesDst: true,
        majorCities: ["Athens", "Thessaloniki", "Patras", "Heraklion"],
        region: "Europe",
      },
    ],
  },
  CZ: {
    countryCode: "CZ",
    countryName: "Czech Republic",
    timezones: [
      {
        timezone: "Europe/Prague",
        displayName: "Central European Time (Prague)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+02:00",
        observesDst: true,
        majorCities: ["Prague", "Brno", "Ostrava", "Plzen"],
        region: "Europe",
      },
    ],
  },
  HU: {
    countryCode: "HU",
    countryName: "Hungary",
    timezones: [
      {
        timezone: "Europe/Budapest",
        displayName: "Central European Time (Budapest)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+02:00",
        observesDst: true,
        majorCities: ["Budapest", "Debrecen", "Szeged", "Miskolc"],
        region: "Europe",
      },
    ],
  },
  RO: {
    countryCode: "RO",
    countryName: "Romania",
    timezones: [
      {
        timezone: "Europe/Bucharest",
        displayName: "Eastern European Time (Bucharest)",
        shortName: "EET",
        utcOffset: "+02:00",
        utcOffsetDst: "+03:00",
        observesDst: true,
        majorCities: ["Bucharest", "Cluj-Napoca", "Timișoara", "Iași"],
        region: "Europe",
      },
    ],
  },
  BG: {
    countryCode: "BG",
    countryName: "Bulgaria",
    timezones: [
      {
        timezone: "Europe/Sofia",
        displayName: "Eastern European Time (Sofia)",
        shortName: "EET",
        utcOffset: "+02:00",
        utcOffsetDst: "+03:00",
        observesDst: true,
        majorCities: ["Sofia", "Plovdiv", "Varna", "Burgas"],
        region: "Europe",
      },
    ],
  },
  HR: {
    countryCode: "HR",
    countryName: "Croatia",
    timezones: [
      {
        timezone: "Europe/Zagreb",
        displayName: "Central European Time (Zagreb)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+02:00",
        observesDst: true,
        majorCities: ["Zagreb", "Split", "Rijeka", "Osijek"],
        region: "Europe",
      },
    ],
  },
  RS: {
    countryCode: "RS",
    countryName: "Serbia",
    timezones: [
      {
        timezone: "Europe/Belgrade",
        displayName: "Central European Time (Belgrade)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+02:00",
        observesDst: true,
        majorCities: ["Belgrade", "Novi Sad", "Niš", "Kragujevac"],
        region: "Europe",
      },
    ],
  },
  SK: {
    countryCode: "SK",
    countryName: "Slovakia",
    timezones: [
      {
        timezone: "Europe/Bratislava",
        displayName: "Central European Time (Bratislava)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+02:00",
        observesDst: true,
        majorCities: ["Bratislava", "Košice", "Prešov", "Žilina"],
        region: "Europe",
      },
    ],
  },
  SI: {
    countryCode: "SI",
    countryName: "Slovenia",
    timezones: [
      {
        timezone: "Europe/Ljubljana",
        displayName: "Central European Time (Ljubljana)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+02:00",
        observesDst: true,
        majorCities: ["Ljubljana", "Maribor", "Celje", "Kranj"],
        region: "Europe",
      },
    ],
  },
  LT: {
    countryCode: "LT",
    countryName: "Lithuania",
    timezones: [
      {
        timezone: "Europe/Vilnius",
        displayName: "Eastern European Time (Vilnius)",
        shortName: "EET",
        utcOffset: "+02:00",
        utcOffsetDst: "+03:00",
        observesDst: true,
        majorCities: ["Vilnius", "Kaunas", "Klaipėda", "Šiauliai"],
        region: "Europe",
      },
    ],
  },
  LV: {
    countryCode: "LV",
    countryName: "Latvia",
    timezones: [
      {
        timezone: "Europe/Riga",
        displayName: "Eastern European Time (Riga)",
        shortName: "EET",
        utcOffset: "+02:00",
        utcOffsetDst: "+03:00",
        observesDst: true,
        majorCities: ["Riga", "Daugavpils", "Liepāja", "Jūrmala"],
        region: "Europe",
      },
    ],
  },
  EE: {
    countryCode: "EE",
    countryName: "Estonia",
    timezones: [
      {
        timezone: "Europe/Tallinn",
        displayName: "Eastern European Time (Tallinn)",
        shortName: "EET",
        utcOffset: "+02:00",
        utcOffsetDst: "+03:00",
        observesDst: true,
        majorCities: ["Tallinn", "Tartu", "Narva", "Pärnu"],
        region: "Europe",
      },
    ],
  },
  IS: {
    countryCode: "IS",
    countryName: "Iceland",
    timezones: [
      {
        timezone: "Atlantic/Reykjavik",
        displayName: "Greenwich Mean Time (Reykjavik)",
        shortName: "GMT",
        utcOffset: "+00:00",
        utcOffsetDst: "+00:00",
        observesDst: false,
        majorCities: ["Reykjavik", "Kópavogur", "Hafnarfjörður"],
        region: "Europe",
      },
    ],
  },
  LU: {
    countryCode: "LU",
    countryName: "Luxembourg",
    timezones: [
      {
        timezone: "Europe/Luxembourg",
        displayName: "Central European Time (Luxembourg)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+02:00",
        observesDst: true,
        majorCities: ["Luxembourg City", "Esch-sur-Alzette"],
        region: "Europe",
      },
    ],
  },
  MT: {
    countryCode: "MT",
    countryName: "Malta",
    timezones: [
      {
        timezone: "Europe/Malta",
        displayName: "Central European Time (Malta)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+02:00",
        observesDst: true,
        majorCities: ["Valletta", "Birkirkara", "Mosta"],
        region: "Europe",
      },
    ],
  },
  CY: {
    countryCode: "CY",
    countryName: "Cyprus",
    timezones: [
      {
        timezone: "Asia/Nicosia",
        displayName: "Eastern European Time (Nicosia)",
        shortName: "EET",
        utcOffset: "+02:00",
        utcOffsetDst: "+03:00",
        observesDst: true,
        majorCities: ["Nicosia", "Limassol", "Larnaca"],
        region: "Asia",
      },
    ],
  },
  BA: {
    countryCode: "BA",
    countryName: "Bosnia and Herzegovina",
    timezones: [
      {
        timezone: "Europe/Sarajevo",
        displayName: "Central European Time (Sarajevo)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+02:00",
        observesDst: true,
        majorCities: ["Sarajevo", "Banja Luka", "Tuzla"],
        region: "Europe",
      },
    ],
  },
  MK: {
    countryCode: "MK",
    countryName: "North Macedonia",
    timezones: [
      {
        timezone: "Europe/Skopje",
        displayName: "Central European Time (Skopje)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+02:00",
        observesDst: true,
        majorCities: ["Skopje", "Bitola", "Kumanovo"],
        region: "Europe",
      },
    ],
  },
  AL: {
    countryCode: "AL",
    countryName: "Albania",
    timezones: [
      {
        timezone: "Europe/Tirane",
        displayName: "Central European Time (Tirana)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+02:00",
        observesDst: true,
        majorCities: ["Tirana", "Durrës", "Vlorë"],
        region: "Europe",
      },
    ],
  },
  ME: {
    countryCode: "ME",
    countryName: "Montenegro",
    timezones: [
      {
        timezone: "Europe/Podgorica",
        displayName: "Central European Time (Podgorica)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+02:00",
        observesDst: true,
        majorCities: ["Podgorica", "Nikšić", "Pljevlja"],
        region: "Europe",
      },
    ],
  },
  XK: {
    countryCode: "XK",
    countryName: "Kosovo",
    timezones: [
      {
        timezone: "Europe/Belgrade",
        displayName: "Central European Time",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+02:00",
        observesDst: true,
        majorCities: ["Pristina", "Prizren", "Mitrovica"],
        region: "Europe",
      },
    ],
  },
  BY: {
    countryCode: "BY",
    countryName: "Belarus",
    timezones: [
      {
        timezone: "Europe/Minsk",
        displayName: "Moscow Standard Time (Minsk)",
        shortName: "MSK",
        utcOffset: "+03:00",
        utcOffsetDst: "+03:00",
        observesDst: false,
        majorCities: ["Minsk", "Gomel", "Mogilev"],
        region: "Europe",
      },
    ],
  },
  MD: {
    countryCode: "MD",
    countryName: "Moldova",
    timezones: [
      {
        timezone: "Europe/Chisinau",
        displayName: "Eastern European Time (Chișinău)",
        shortName: "EET",
        utcOffset: "+02:00",
        utcOffsetDst: "+03:00",
        observesDst: true,
        majorCities: ["Chișinău", "Tiraspol", "Bălți"],
        region: "Europe",
      },
    ],
  },
  GE: {
    countryCode: "GE",
    countryName: "Georgia",
    timezones: [
      {
        timezone: "Asia/Tbilisi",
        displayName: "Georgia Standard Time (Tbilisi)",
        shortName: "GET",
        utcOffset: "+04:00",
        utcOffsetDst: "+04:00",
        observesDst: false,
        majorCities: ["Tbilisi", "Batumi", "Kutaisi"],
        region: "Asia",
      },
    ],
  },
  AM: {
    countryCode: "AM",
    countryName: "Armenia",
    timezones: [
      {
        timezone: "Asia/Yerevan",
        displayName: "Armenia Standard Time (Yerevan)",
        shortName: "AMT",
        utcOffset: "+04:00",
        utcOffsetDst: "+04:00",
        observesDst: false,
        majorCities: ["Yerevan", "Gyumri", "Vanadzor"],
        region: "Asia",
      },
    ],
  },
  AZ: {
    countryCode: "AZ",
    countryName: "Azerbaijan",
    timezones: [
      {
        timezone: "Asia/Baku",
        displayName: "Azerbaijan Time (Baku)",
        shortName: "AZT",
        utcOffset: "+04:00",
        utcOffsetDst: "+04:00",
        observesDst: false,
        majorCities: ["Baku", "Ganja", "Sumqayit"],
        region: "Asia",
      },
    ],
  },
  KZ: {
    countryCode: "KZ",
    countryName: "Kazakhstan",
    timezones: [
      {
        timezone: "Asia/Almaty",
        displayName: "Almaty Time",
        shortName: "ALMT",
        utcOffset: "+06:00",
        utcOffsetDst: "+06:00",
        observesDst: false,
        majorCities: ["Almaty", "Nur-Sultan", "Shymkent"],
        region: "Asia",
      },
      {
        timezone: "Asia/Aqtobe",
        displayName: "Aqtobe Time",
        shortName: "AQTT",
        utcOffset: "+05:00",
        utcOffsetDst: "+05:00",
        observesDst: false,
        majorCities: ["Aqtobe"],
        region: "Asia",
      },
      {
        timezone: "Asia/Aqtau",
        displayName: "Aqtau Time",
        shortName: "AQTT",
        utcOffset: "+05:00",
        utcOffsetDst: "+05:00",
        observesDst: false,
        majorCities: ["Aqtau"],
        region: "Asia",
      },
      {
        timezone: "Asia/Oral",
        displayName: "Oral Time",
        shortName: "ORAT",
        utcOffset: "+05:00",
        utcOffsetDst: "+05:00",
        observesDst: false,
        majorCities: ["Oral"],
        region: "Asia",
      },
      {
        timezone: "Asia/Qyzylorda",
        displayName: "Qyzylorda Time",
        shortName: "QYZT",
        utcOffset: "+05:00",
        utcOffsetDst: "+05:00",
        observesDst: false,
        majorCities: ["Qyzylorda"],
        region: "Asia",
      },
    ],
  },
  UZ: {
    countryCode: "UZ",
    countryName: "Uzbekistan",
    timezones: [
      {
        timezone: "Asia/Tashkent",
        displayName: "Uzbekistan Time (Tashkent)",
        shortName: "UZT",
        utcOffset: "+05:00",
        utcOffsetDst: "+05:00",
        observesDst: false,
        majorCities: ["Tashkent", "Samarkand", "Bukhara"],
        region: "Asia",
      },
    ],
  },
  BD: {
    countryCode: "BD",
    countryName: "Bangladesh",
    timezones: [
      {
        timezone: "Asia/Dhaka",
        displayName: "Bangladesh Standard Time (Dhaka)",
        shortName: "BST",
        utcOffset: "+06:00",
        utcOffsetDst: "+06:00",
        observesDst: false,
        majorCities: ["Dhaka", "Chittagong", "Khulna"],
        region: "Asia",
      },
    ],
  },
  LK: {
    countryCode: "LK",
    countryName: "Sri Lanka",
    timezones: [
      {
        timezone: "Asia/Colombo",
        displayName: "Sri Lanka Standard Time (Colombo)",
        shortName: "SLST",
        utcOffset: "+05:30",
        utcOffsetDst: "+05:30",
        observesDst: false,
        majorCities: ["Colombo", "Kandy", "Galle"],
        region: "Asia",
      },
    ],
  },
  NP: {
    countryCode: "NP",
    countryName: "Nepal",
    timezones: [
      {
        timezone: "Asia/Kathmandu",
        displayName: "Nepal Time (Kathmandu)",
        shortName: "NPT",
        utcOffset: "+05:45",
        utcOffsetDst: "+05:45",
        observesDst: false,
        majorCities: ["Kathmandu", "Pokhara", "Lalitpur"],
        region: "Asia",
      },
    ],
  },
  MM: {
    countryCode: "MM",
    countryName: "Myanmar",
    timezones: [
      {
        timezone: "Asia/Yangon",
        displayName: "Myanmar Time (Yangon)",
        shortName: "MMT",
        utcOffset: "+06:30",
        utcOffsetDst: "+06:30",
        observesDst: false,
        majorCities: ["Yangon", "Mandalay", "Naypyidaw"],
        region: "Asia",
      },
    ],
  },
  TW: {
    countryCode: "TW",
    countryName: "Taiwan",
    timezones: [
      {
        timezone: "Asia/Taipei",
        displayName: "Taiwan Standard Time (Taipei)",
        shortName: "TST",
        utcOffset: "+08:00",
        utcOffsetDst: "+08:00",
        observesDst: false,
        majorCities: ["Taipei", "Kaohsiung", "Taichung"],
        region: "Asia",
      },
    ],
  },
  HK: {
    countryCode: "HK",
    countryName: "Hong Kong",
    timezones: [
      {
        timezone: "Asia/Hong_Kong",
        displayName: "Hong Kong Time",
        shortName: "HKT",
        utcOffset: "+08:00",
        utcOffsetDst: "+08:00",
        observesDst: false,
        majorCities: ["Hong Kong"],
        region: "Asia",
      },
    ],
  },
  MO: {
    countryCode: "MO",
    countryName: "Macau",
    timezones: [
      {
        timezone: "Asia/Macau",
        displayName: "Macau Time",
        shortName: "MOT",
        utcOffset: "+08:00",
        utcOffsetDst: "+08:00",
        observesDst: false,
        majorCities: ["Macau"],
        region: "Asia",
      },
    ],
  },
  PE: {
    countryCode: "PE",
    countryName: "Peru",
    timezones: [
      {
        timezone: "America/Lima",
        displayName: "Peru Time (Lima)",
        shortName: "PET",
        utcOffset: "-05:00",
        utcOffsetDst: "-05:00",
        observesDst: false,
        majorCities: ["Lima", "Arequipa", "Trujillo"],
        region: "South America",
      },
    ],
  },
  EC: {
    countryCode: "EC",
    countryName: "Ecuador",
    timezones: [
      {
        timezone: "America/Guayaquil",
        displayName: "Ecuador Time (Guayaquil)",
        shortName: "ECT",
        utcOffset: "-05:00",
        utcOffsetDst: "-05:00",
        observesDst: false,
        majorCities: ["Guayaquil", "Quito", "Cuenca"],
        region: "South America",
      },
      {
        timezone: "Pacific/Galapagos",
        displayName: "Galapagos Time",
        shortName: "GALT",
        utcOffset: "-06:00",
        utcOffsetDst: "-06:00",
        observesDst: false,
        majorCities: ["Puerto Baquerizo Moreno"],
        region: "Pacific",
      },
    ],
  },
  VE: {
    countryCode: "VE",
    countryName: "Venezuela",
    timezones: [
      {
        timezone: "America/Caracas",
        displayName: "Venezuela Time (Caracas)",
        shortName: "VET",
        utcOffset: "-04:00",
        utcOffsetDst: "-04:00",
        observesDst: false,
        majorCities: ["Caracas", "Maracaibo", "Valencia"],
        region: "South America",
      },
    ],
  },
  UY: {
    countryCode: "UY",
    countryName: "Uruguay",
    timezones: [
      {
        timezone: "America/Montevideo",
        displayName: "Uruguay Time (Montevideo)",
        shortName: "UYT",
        utcOffset: "-03:00",
        utcOffsetDst: "-03:00",
        observesDst: false,
        majorCities: ["Montevideo", "Salto", "Paysandú"],
        region: "South America",
      },
    ],
  },
  PY: {
    countryCode: "PY",
    countryName: "Paraguay",
    timezones: [
      {
        timezone: "America/Asuncion",
        displayName: "Paraguay Time (Asunción)",
        shortName: "PYT",
        utcOffset: "-04:00",
        utcOffsetDst: "-03:00",
        observesDst: true,
        majorCities: ["Asunción", "Ciudad del Este", "San Lorenzo"],
        region: "South America",
      },
    ],
  },
  BO: {
    countryCode: "BO",
    countryName: "Bolivia",
    timezones: [
      {
        timezone: "America/La_Paz",
        displayName: "Bolivia Time (La Paz)",
        shortName: "BOT",
        utcOffset: "-04:00",
        utcOffsetDst: "-04:00",
        observesDst: false,
        majorCities: ["La Paz", "Santa Cruz", "Cochabamba"],
        region: "South America",
      },
    ],
  },
  CR: {
    countryCode: "CR",
    countryName: "Costa Rica",
    timezones: [
      {
        timezone: "America/Costa_Rica",
        displayName: "Central Standard Time (Costa Rica)",
        shortName: "CST",
        utcOffset: "-06:00",
        utcOffsetDst: "-06:00",
        observesDst: false,
        majorCities: ["San José", "Cartago", "Alajuela"],
        region: "Central America",
      },
    ],
  },
  PA: {
    countryCode: "PA",
    countryName: "Panama",
    timezones: [
      {
        timezone: "America/Panama",
        displayName: "Eastern Standard Time (Panama)",
        shortName: "EST",
        utcOffset: "-05:00",
        utcOffsetDst: "-05:00",
        observesDst: false,
        majorCities: ["Panama City", "Colón", "David"],
        region: "Central America",
      },
    ],
  },
  GT: {
    countryCode: "GT",
    countryName: "Guatemala",
    timezones: [
      {
        timezone: "America/Guatemala",
        displayName: "Central Standard Time (Guatemala)",
        shortName: "CST",
        utcOffset: "-06:00",
        utcOffsetDst: "-06:00",
        observesDst: false,
        majorCities: ["Guatemala City", "Mixco", "Villa Nueva"],
        region: "Central America",
      },
    ],
  },
  HN: {
    countryCode: "HN",
    countryName: "Honduras",
    timezones: [
      {
        timezone: "America/Tegucigalpa",
        displayName: "Central Standard Time (Tegucigalpa)",
        shortName: "CST",
        utcOffset: "-06:00",
        utcOffsetDst: "-06:00",
        observesDst: false,
        majorCities: ["Tegucigalpa", "San Pedro Sula", "Choloma"],
        region: "Central America",
      },
    ],
  },
  SV: {
    countryCode: "SV",
    countryName: "El Salvador",
    timezones: [
      {
        timezone: "America/El_Salvador",
        displayName: "Central Standard Time (El Salvador)",
        shortName: "CST",
        utcOffset: "-06:00",
        utcOffsetDst: "-06:00",
        observesDst: false,
        majorCities: ["San Salvador", "Santa Ana", "Soyapango"],
        region: "Central America",
      },
    ],
  },
  NI: {
    countryCode: "NI",
    countryName: "Nicaragua",
    timezones: [
      {
        timezone: "America/Managua",
        displayName: "Central Standard Time (Managua)",
        shortName: "CST",
        utcOffset: "-06:00",
        utcOffsetDst: "-06:00",
        observesDst: false,
        majorCities: ["Managua", "León", "Masaya"],
        region: "Central America",
      },
    ],
  },
  DO: {
    countryCode: "DO",
    countryName: "Dominican Republic",
    timezones: [
      {
        timezone: "America/Santo_Domingo",
        displayName: "Atlantic Standard Time (Santo Domingo)",
        shortName: "AST",
        utcOffset: "-04:00",
        utcOffsetDst: "-04:00",
        observesDst: false,
        majorCities: ["Santo Domingo", "Santiago", "La Romana"],
        region: "Caribbean",
      },
    ],
  },
  CU: {
    countryCode: "CU",
    countryName: "Cuba",
    timezones: [
      {
        timezone: "America/Havana",
        displayName: "Cuba Time (Havana)",
        shortName: "CST",
        utcOffset: "-05:00",
        utcOffsetDst: "-04:00",
        observesDst: true,
        majorCities: ["Havana", "Santiago de Cuba", "Camagüey"],
        region: "Caribbean",
      },
    ],
  },
  JM: {
    countryCode: "JM",
    countryName: "Jamaica",
    timezones: [
      {
        timezone: "America/Jamaica",
        displayName: "Eastern Standard Time (Jamaica)",
        shortName: "EST",
        utcOffset: "-05:00",
        utcOffsetDst: "-05:00",
        observesDst: false,
        majorCities: ["Kingston", "Montego Bay", "Spanish Town"],
        region: "Caribbean",
      },
    ],
  },
  TZ: {
    countryCode: "TZ",
    countryName: "Tanzania",
    timezones: [
      {
        timezone: "Africa/Dar_es_Salaam",
        displayName: "East Africa Time (Dar es Salaam)",
        shortName: "EAT",
        utcOffset: "+03:00",
        utcOffsetDst: "+03:00",
        observesDst: false,
        majorCities: ["Dar es Salaam", "Mwanza", "Arusha"],
        region: "Africa",
      },
    ],
  },
  UG: {
    countryCode: "UG",
    countryName: "Uganda",
    timezones: [
      {
        timezone: "Africa/Kampala",
        displayName: "East Africa Time (Kampala)",
        shortName: "EAT",
        utcOffset: "+03:00",
        utcOffsetDst: "+03:00",
        observesDst: false,
        majorCities: ["Kampala", "Gulu", "Lira"],
        region: "Africa",
      },
    ],
  },
  ET: {
    countryCode: "ET",
    countryName: "Ethiopia",
    timezones: [
      {
        timezone: "Africa/Addis_Ababa",
        displayName: "East Africa Time (Addis Ababa)",
        shortName: "EAT",
        utcOffset: "+03:00",
        utcOffsetDst: "+03:00",
        observesDst: false,
        majorCities: ["Addis Ababa", "Dire Dawa", "Mek'ele"],
        region: "Africa",
      },
    ],
  },
  MA: {
    countryCode: "MA",
    countryName: "Morocco",
    timezones: [
      {
        timezone: "Africa/Casablanca",
        displayName: "Western European Time (Casablanca)",
        shortName: "WET",
        utcOffset: "+01:00",
        utcOffsetDst: "+00:00",
        observesDst: true,
        majorCities: ["Casablanca", "Rabat", "Fes", "Marrakech"],
        region: "Africa",
      },
    ],
  },
  TN: {
    countryCode: "TN",
    countryName: "Tunisia",
    timezones: [
      {
        timezone: "Africa/Tunis",
        displayName: "Central European Time (Tunis)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+01:00",
        observesDst: false,
        majorCities: ["Tunis", "Sfax", "Sousse"],
        region: "Africa",
      },
    ],
  },
  DZ: {
    countryCode: "DZ",
    countryName: "Algeria",
    timezones: [
      {
        timezone: "Africa/Algiers",
        displayName: "Central European Time (Algiers)",
        shortName: "CET",
        utcOffset: "+01:00",
        utcOffsetDst: "+01:00",
        observesDst: false,
        majorCities: ["Algiers", "Oran", "Constantine"],
        region: "Africa",
      },
    ],
  },
  LY: {
    countryCode: "LY",
    countryName: "Libya",
    timezones: [
      {
        timezone: "Africa/Tripoli",
        displayName: "Eastern European Time (Tripoli)",
        shortName: "EET",
        utcOffset: "+02:00",
        utcOffsetDst: "+02:00",
        observesDst: false,
        majorCities: ["Tripoli", "Benghazi", "Misrata"],
        region: "Africa",
      },
    ],
  },
  SD: {
    countryCode: "SD",
    countryName: "Sudan",
    timezones: [
      {
        timezone: "Africa/Khartoum",
        displayName: "Central Africa Time (Khartoum)",
        shortName: "CAT",
        utcOffset: "+02:00",
        utcOffsetDst: "+02:00",
        observesDst: false,
        majorCities: ["Khartoum", "Omdurman", "Port Sudan"],
        region: "Africa",
      },
    ],
  },
  ZM: {
    countryCode: "ZM",
    countryName: "Zambia",
    timezones: [
      {
        timezone: "Africa/Lusaka",
        displayName: "Central Africa Time (Lusaka)",
        shortName: "CAT",
        utcOffset: "+02:00",
        utcOffsetDst: "+02:00",
        observesDst: false,
        majorCities: ["Lusaka", "Kitwe", "Ndola"],
        region: "Africa",
      },
    ],
  },
  MW: {
    countryCode: "MW",
    countryName: "Malawi",
    timezones: [
      {
        timezone: "Africa/Blantyre",
        displayName: "Central Africa Time (Blantyre)",
        shortName: "CAT",
        utcOffset: "+02:00",
        utcOffsetDst: "+02:00",
        observesDst: false,
        majorCities: ["Blantyre", "Lilongwe", "Mzuzu"],
        region: "Africa",
      },
    ],
  },
  MZ: {
    countryCode: "MZ",
    countryName: "Mozambique",
    timezones: [
      {
        timezone: "Africa/Maputo",
        displayName: "Central Africa Time (Maputo)",
        shortName: "CAT",
        utcOffset: "+02:00",
        utcOffsetDst: "+02:00",
        observesDst: false,
        majorCities: ["Maputo", "Beira", "Nampula"],
        region: "Africa",
      },
    ],
  },
  AO: {
    countryCode: "AO",
    countryName: "Angola",
    timezones: [
      {
        timezone: "Africa/Luanda",
        displayName: "West Africa Time (Luanda)",
        shortName: "WAT",
        utcOffset: "+01:00",
        utcOffsetDst: "+01:00",
        observesDst: false,
        majorCities: ["Luanda", "Huambo", "Lobito"],
        region: "Africa",
      },
    ],
  },
  SN: {
    countryCode: "SN",
    countryName: "Senegal",
    timezones: [
      {
        timezone: "Africa/Dakar",
        displayName: "Greenwich Mean Time (Dakar)",
        shortName: "GMT",
        utcOffset: "+00:00",
        utcOffsetDst: "+00:00",
        observesDst: false,
        majorCities: ["Dakar", "Thiès", "Rufisque"],
        region: "Africa",
      },
    ],
  },
  CI: {
    countryCode: "CI",
    countryName: "Ivory Coast",
    timezones: [
      {
        timezone: "Africa/Abidjan",
        displayName: "Greenwich Mean Time (Abidjan)",
        shortName: "GMT",
        utcOffset: "+00:00",
        utcOffsetDst: "+00:00",
        observesDst: false,
        majorCities: ["Abidjan", "Bouaké", "Daloa"],
        region: "Africa",
      },
    ],
  },
};

// Legacy simple mapping for backward compatibility
export const countryTimezones: Record<string, string[]> = Object.fromEntries(
  Object.entries(countryTimezoneDetails).map(([code, data]) => [
    code,
    data.timezones.map((tz) => tz.timezone),
  ])
);

// Get timezones for a country code (returns simple array for backward compatibility)
export function getTimezonesForCountry(countryCode: string): string[] {
  return countryTimezones[countryCode] || [];
}

// Get detailed timezone information for a country
export function getTimezoneDetailsForCountry(countryCode: string): CountryTimezoneData | null {
  return countryTimezoneDetails[countryCode] || null;
}

// Get detailed information for a specific timezone
export function getTimezoneInfo(timezone: string): TimezoneInfo | null {
  for (const countryData of Object.values(countryTimezoneDetails)) {
    const tzInfo = countryData.timezones.find((tz) => tz.timezone === timezone);
    if (tzInfo) {
      return tzInfo;
    }
  }
  return null;
}

// Get country code from timezone (reverse lookup)
export function getCountryFromTimezone(timezone: string): string | null {
  for (const [countryCode, data] of Object.entries(countryTimezoneDetails)) {
    if (data.timezones.some((tz) => tz.timezone === timezone)) {
      return countryCode;
    }
  }
  return null;
}

// Get all countries with timezone data
export function getAllCountries(): CountryTimezoneData[] {
  return Object.values(countryTimezoneDetails);
}

// Get timezone display name (with fallback to formatted IANA name)
export function getTimezoneDisplayName(timezone: string): string {
  const info = getTimezoneInfo(timezone);
  if (info) {
    return info.displayName;
  }
  // Fallback: format IANA timezone name
  const parts = timezone.split("/");
  if (parts.length > 1) {
    const region = parts[0]?.replace(/_/g, " ") || "";
    const city = parts[parts.length - 1]?.replace(/_/g, " ") || "";
    return `${region} (${city})`;
  }
  return timezone.replace(/_/g, " ");
}

// Get current UTC offset for a timezone (approximate, doesn't account for DST changes)
export function getTimezoneUtcOffset(timezone: string): string | null {
  const info = getTimezoneInfo(timezone);
  return info?.utcOffset || null;
}
