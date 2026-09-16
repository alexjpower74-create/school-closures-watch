// MOCK-ONLY engine. A small stand-in for core/status.js and the Worker's endpoints, so the screens can be built
// and tested without a Worker: region expansion (a region/province notice applies to that region's NLSchools
// schools), ranks and Unknown reasons per API.md §4.5, and the §7 response shapes.
// It deliberately does NOT sort My schools: the app sorts (API.md §4.5), and the app's sort is what is tested.
import { SCHOOLS, COUNTS, SCHOOL_SOURCES } from './data.js'
import { REGISTRY } from './registry.js'
import { labelFor, rankFor, REASON_TEXT, MAY_APPLY_TEXT, REGIONS } from '../labels.js'
import { fmtTime, localDate, fill } from '../format.js'

function httpError(status, code, message) {
  const err = new Error(message)
  err.status = status
  err.code = code
  return err
}

/** §5.4 may_apply reason_text, including the wording for a missing community (lead 15:10). */
export function mayApplyText(reason, n) {
  if (reason === 'name_same_community_differs' && !n.community_text) return MAY_APPLY_TEXT.name_same_community_differs_none
  return fill(MAY_APPLY_TEXT[reason], n)
}

export function createEngine({ now, health, notices }) {
  const today_local = localDate(now)
  // Old lists never set today's status (API.md §4.5, lead fix 14:55): they only show under "earlier" on Today.
  const isOld = (n) => n.list_date !== null && n.list_date !== undefined && n.list_date < today_local
  const current = notices.filter((n) => !n.removed_at && !isOld(n))
  const byId = Object.fromEntries(notices.map((n) => [n.id, n]))
  const schoolById = Object.fromEntries(SCHOOLS.map((s) => [s.id, s]))
  const nls = health['nlschools-status']
  const withRegistry = (id) => ({ ...REGISTRY.find((r) => r.id === id), ...(health[id] || {}) })
  const usedSources = REGISTRY.filter((r) => r.kind === 'used').map((r) => withRegistry(r.id))
  const stale = usedSources.filter((s) => s.stale).map((s) => ({ source_id: s.id, text: s.stale_text }))
  const regionOf = (n) => String(n.region_text || '').toLowerCase()

  /** How a notice applies to a school: exact | region | province | null. */
  function howApplies(n, school) {
    if (n.matches?.some((m) => m.school_id === school.id && m.how === 'exact')) return 'exact'
    if (school.coverage !== 'nlschools') return null
    if (n.scope === 'region' && n.scope_region === school.region) return 'region'
    if (n.scope === 'province') return 'province'
    return null
  }

  function mayApplyEntries(school, sourceIds) {
    const out = []
    for (const n of current) {
      if (sourceIds && !sourceIds.includes(n.source_id)) continue
      const m = n.matches?.find((x) => x.school_id === school.id && x.how === 'may_apply')
      if (m) out.push({ notice_id: n.id, reason: m.reason, reason_text: mayApplyText(m.reason, n) })
    }
    return out
  }

  function statusFor(school) {
    const st = {
      school,
      status: null,
      label: null,
      rank: null,
      source_status_text: null,
      headline_notice_id: null,
      applies: [],
      may_apply: [],
      reason: null,
      reason_text: null,
      as_of: null,
      stale: false,
      list_date_text: nls?.list_date_text ?? null,
      unmatched_in_region: 0,
    }
    const set = (code) => Object.assign(st, { status: code, label: labelFor(code), rank: rankFor(code) })
    const headline = (n) => {
      set(n.status)
      st.headline_notice_id = n.id
      if (!['open', 'unknown', 'may_apply'].includes(n.status)) st.source_status_text = n.status_text ?? null
    }
    const unknown = (reason, vars = {}) => {
      set('unknown')
      st.reason = reason
      st.reason_text = fill(REASON_TEXT[reason], vars)
    }

    if (school.coverage === 'nlschools') {
      const applying = current.map((n) => ({ n, how: howApplies(n, school) })).filter((x) => x.how && x.n.source_id !== 'csfp-news')
      st.applies = applying.map((x) => ({ notice_id: x.n.id, how: x.how }))
      st.may_apply = mayApplyEntries(school, ['nlschools-status', 'nlschools-notices'])
      st.as_of = nls.last_ok_at
      // NLSchools schools only (API.md §5.4, lead 15:10); CSFP and other schools keep 0.
      st.unmatched_in_region = current.filter((n) => n.scope === 'unmatched' && regionOf(n) === school.region).length
      const worst = applying.map((x) => x.n).sort((a, b) => rankFor(a.status) - rankFor(b.status))[0]
      if (nls.stale) {
        st.stale = true
        if (worst) headline(worst)
        else if (!nls.last_ok_at) {
          unknown('stale')
          st.reason_text = REASON_TEXT.stale_never
        } else unknown('stale', { time: fmtTime(nls.last_ok_at) })
      } else if (worst) headline(worst)
      else if (st.may_apply.length) {
        set('may_apply')
        st.headline_notice_id = st.may_apply[0].notice_id
      } else if (!nls.list_date) unknown('list_date_missing')
      else if (nls.list_date < today_local) unknown('list_date_old', { list_date_text: nls.list_date_text })
      else if (!nls.open_rule_quote) unknown('open_rule_missing')
      else set('open')
    } else if (school.coverage === 'csfp') {
      const csfp = health['csfp-news']
      st.as_of = csfp?.last_ok_at ?? null
      st.stale = !!csfp?.stale
      st.may_apply = mayApplyEntries(school, ['csfp-news'])
      if (st.may_apply.length) {
        set('may_apply')
        st.headline_notice_id = st.may_apply[0].notice_id
      } else unknown('csfp_no_online_status')
    } else {
      unknown('no_official_source')
    }
    return st
  }

  const withAppliesTo = (n) => ({
    ...n,
    applies_to: (n.matches || [])
      .map((m) => {
        const s = schoolById[m.school_id]
        return (
          s && { school_id: s.id, name: s.name, community: s.community, how: m.how, ...(m.how === 'may_apply' ? { reason: m.reason } : {}) }
        )
      })
      .filter(Boolean),
  })

  return {
    schools: () => ({ built_from_fetch: null, count: SCHOOLS.length, schools: SCHOOLS }),

    status(ids) {
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 30) throw httpError(400, 'bad_ids', 'Send 1 to 30 school ids.')
      const found = ids.filter((id) => schoolById[id])
      const schools = found.map((id) => statusFor(schoolById[id])) // request order: the app sorts
      const noticeMap = {}
      for (const s of schools) {
        for (const a of [...s.applies, ...s.may_apply]) noticeMap[a.notice_id] = byId[a.notice_id]
      }
      return {
        now,
        today_local,
        sources: usedSources,
        stale,
        district_notices: current.filter((n) => n.scope === 'district'),
        schools,
        notices: noticeMap,
        unknown_ids: ids.filter((id) => !schoolById[id]),
      }
    },

    today() {
      const nlsCurrent = current.filter((n) => n.source_id !== 'csfp-news')
      const by_status = {}
      for (const n of nlsCurrent) by_status[n.status] = (by_status[n.status] || 0) + 1
      return {
        now,
        today_local,
        list_date: nls.list_date,
        list_date_text: nls.list_date_text,
        sources: usedSources,
        stale,
        counts: { current: nlsCurrent.length, by_status },
        district: current.filter((n) => n.scope === 'district'),
        region_wide: current.filter((n) => n.scope === 'region' || n.scope === 'province'),
        regions: REGIONS.map((r) => ({
          ...r,
          notices: current.filter((n) => n.kind === 'school_row' && n.scope === 'school' && regionOf(n) === r.region).map(withAppliesTo),
          unmatched: current.filter((n) => n.scope === 'unmatched' && regionOf(n) === r.region),
          earlier: notices
            .filter((n) => ((n.removed_at && n.list_date === nls.list_date) || (!n.removed_at && isOld(n))) && regionOf(n) === r.region)
            .map(withAppliesTo),
        })),
        csfp: current.filter((n) => n.source_id === 'csfp-news'),
        open_rule_quote: nls.open_rule_quote,
      }
    },

    notice(id) {
      const n = byId[id]
      if (!n) throw httpError(404, 'not_found', 'No notice with that id.')
      return {
        notice: n,
        source: withRegistry(n.source_id),
        applies_to: SCHOOLS.map((school) => ({ school, how: howApplies(n, school) })).filter((x) => x.how),
        may_apply_to: (n.matches || [])
          .filter((m) => m.how === 'may_apply' && schoolById[m.school_id])
          .map((m) => ({ school: schoolById[m.school_id], reason: m.reason, reason_text: mayApplyText(m.reason, n) })),
        raw_links: (n.raw_refs || []).map((raw_ref) => ({ raw_ref, href: null, fetched_at: n.last_seen_at })),
      }
    },

    sources() {
      return {
        now,
        sources: REGISTRY.map((r) => (r.kind === 'used' ? withRegistry(r.id) : { ...r })),
        schools: { counts: COUNTS, sources: SCHOOL_SOURCES },
      }
    },
  }
}
