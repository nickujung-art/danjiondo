import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// 로그인 필요 경로 prefix
const PROTECTED = ['/profile', '/favorites', '/admin']

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const isProtected = PROTECTED.some((p) => pathname.startsWith(p))

  // 보호 경로만 auth 확인 — 공개 단지·지역 페이지는 DB 왕복 없이 즉시 통과
  if (isProtected) {
    const response = NextResponse.next({ request })
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value)
              response.cookies.set(name, value, options)
            })
          },
        },
      },
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl)
    }
    return response
  }

  return NextResponse.next({ request })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|fonts).*)',
  ],
}
