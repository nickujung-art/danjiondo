-- complex_status enum에 merged, rental 추가
ALTER TYPE complex_status ADD VALUE IF NOT EXISTS 'merged';
ALTER TYPE complex_status ADD VALUE IF NOT EXISTS 'rental';
