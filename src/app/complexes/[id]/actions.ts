'use server'

import { createReadonlyClient } from '@/lib/supabase/readonly'

/**
 * 단지 조회수를 1 증가시키는 Server Action.
 * 클라이언트 컴포넌트의 useEffect에서 호출 (ISR 페이지 빌드 타임 실행 방지).
 * 세션 내 중복 방지는 호출 측에서 sessionStorage로 처리.
 *
 * increment_view_count RPC는 마이그레이션에서 anon role에 GRANT EXECUTE되어 있으므로
 * anon key를 사용하는 createReadonlyClient()로도 UPDATE가 허용된다.
 */
export async function incrementViewCount(complexId: string): Promise<void> {
  const supabase = createReadonlyClient()
  // error를 반드시 본다. 이 RPC는 **프로젝트 전 기간 동안 한 번도 동작하지 않았는데**
  // (전체 단지 view_count=0, F-01-28) 아무 에러도 나지 않아 오래 묻혔다 —
  // RLS에 막힌 UPDATE는 "0행 성공"으로 끝나고, supabase-js는 예외를 던지지 않는다.
  // 지금은 SECURITY DEFINER로 고쳐져 동작하지만, 조용히 되돌아가지 않도록 남긴다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('increment_view_count', { p_complex_id: complexId })
  if (error) {
    console.error(`[view-count] 조회수 증가 실패 (complex=${complexId}): ${error.message}`)
  }
}
