/**
 * 이 저장소(danjiondo)가 소유하는 site_id.
 *
 * `favorites`·`ad_campaigns` 같은 테이블은 danjiondo 와 realtrade-story 가 **한 Supabase
 * 프로젝트에서 공유**한다. 사이트 분리는 RLS 가 아니라 **애플리케이션 코드 책임**이다 —
 * DB 는 막아주지 않는다.
 *
 * `favorites.site_id` 는 기본값이 'danjiondo' 라 INSERT 는 필터를 빠뜨려도 조용히 통과한다.
 * 문제는 SELECT/DELETE/UPDATE 다. 필터가 없으면 다른 사이트의 행까지 읽고 지운다.
 * 2026-07-31 시점에 실제로 이 상태였다:
 *   - removeFavorite 이 realtrade-story 즐겨찾기·평형별 가격알림까지 함께 삭제
 *   - 즐겨찾기 목록·프로필 카운트·랭킹 집계·주간 다이제스트가 realtrade-story 행을 포함
 *     (그때 favorites 4행이 전부 realtrade-story 것이어서 danjiondo 화면에 그대로 노출됐다)
 *
 * 새로 favorites 를 건드리는 코드를 쓸 때는 이 상수를 반드시 함께 쓴다.
 */
export const SITE_ID = 'danjiondo'

/**
 * 어드민 함수의 site_id 필터 파라미터.
 * 기본값 없는 필수 인자로 쓴다 — 빠뜨렸을 때 전체가 나오는 것과,
 * 'all' 을 명시해서 전체를 받는 것은 다른 설계다.
 */
export type SiteIdFilter = 'danjiondo' | 'realtrade-story' | 'changbuletter' | 'all'
