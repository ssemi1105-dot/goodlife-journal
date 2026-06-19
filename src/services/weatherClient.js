export const WEATHER_ENABLED_CATEGORIES = [
  'fishing',
  'dining',
  'cooking',
  'exercise',
  'shopping',
  'meeting',
  'game',
  'dream',
  'idea',
  'recipe',
  'hospital',
  'salary',
  'delivery',
  'savings',
  'subscription',
  'annual_leave',
  'workMeal',
  'outing',
  'domesticTravel',
  'overseasTravel',
];

export const DEFAULT_WEATHER_LOCATION = {
  name: '경기도 구리시 인창동',
  latitude: 37.5,
  longitude: 127.0,
};

const WEATHER_LABELS = {
  0: '맑음',
  1: '대체로 맑음',
  2: '부분적으로 흐림',
  3: '흐림',
  45: '안개',
  48: '서리 안개',
  51: '약한 이슬비',
  53: '이슬비',
  55: '강한 이슬비',
  56: '약한 어는 이슬비',
  57: '강한 어는 이슬비',
  61: '약한 비',
  63: '비',
  65: '강한 비',
  66: '약한 어는 비',
  67: '강한 어는 비',
  71: '약한 눈',
  73: '눈',
  75: '강한 눈',
  77: '싸락눈',
  80: '약한 소나기',
  81: '소나기',
  82: '강한 소나기',
  85: '약한 눈 소나기',
  86: '강한 눈 소나기',
  95: '천둥번개',
  96: '우박 동반 천둥번개',
  99: '강한 우박 동반 천둥번개',
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isPastDate(date) {
  return date < todayIso();
}

export function getWeatherLabel(code) {
  return WEATHER_LABELS[Number(code)] || '날씨 정보';
}

export function getWeatherTargetDate(categoryId, form = {}) {
  if (categoryId === 'annual_leave') {
    if (form.recordType !== 'use') return '';
    return form.date || '';
  }
  if (categoryId === 'fishing' || categoryId === 'domesticTravel' || categoryId === 'overseasTravel') {
    return form.startDate || form.date || '';
  }
  return form.date || '';
}

export function isWeatherEnabledCategory(categoryId) {
  return WEATHER_ENABLED_CATEGORIES.includes(categoryId);
}

export async function searchWeatherLocation(query) {
  const keyword = String(query || '').trim();
  if (keyword.length < 2) return [];

  const params = new URLSearchParams({
    name: keyword,
    count: '5',
    language: 'ko',
    format: 'json',
  });

  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`);
  if (!response.ok) throw new Error('위치 검색에 실패했습니다.');

  const json = await response.json();
  return (json.results || []).map((item) => ({
    name: [item.name, item.admin2, item.admin1, item.country].filter(Boolean).join(', '),
    latitude: item.latitude,
    longitude: item.longitude,
  }));
}

export async function fetchWeatherForDate({
  date,
  latitude = DEFAULT_WEATHER_LOCATION.latitude,
  longitude = DEFAULT_WEATHER_LOCATION.longitude,
  locationName = DEFAULT_WEATHER_LOCATION.name,
}) {
  if (!date) return null;

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    timezone: 'Asia/Seoul',
    start_date: date,
    end_date: date,
    daily: 'temperature_2m_max,temperature_2m_min,weathercode',
  });

  let url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  if (isPastDate(date)) {
    url = `https://archive-api.open-meteo.com/v1/archive?${params.toString()}`;
  } else {
    params.set('current_weather', 'true');
    url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error('날씨 정보를 가져오지 못했습니다.');

  const json = await response.json();
  const daily = json.daily || {};
  const weatherCode = daily.weathercode?.[0] ?? json.current_weather?.weathercode ?? null;

  return {
    weatherCode,
    weatherLabel: getWeatherLabel(weatherCode),
    temperatureMax: daily.temperature_2m_max?.[0] ?? null,
    temperatureMin: daily.temperature_2m_min?.[0] ?? null,
    locationName,
    latitude,
    longitude,
    fetchedAt: new Date().toISOString(),
  };
}
