export const APP_NAME = 'UMCCR GitHub Portfolio'

export const DASHBOARD_ORGANIZATIONS = Object.freeze(['OrcaBus', 'umccr'])

export const ORGANIZATION_LABELS = Object.freeze({
  OrcaBus: 'OrcaBus',
  umccr: 'UMCCR',
})

export const STORAGE_KEYS = Object.freeze({
  organizationScope: 'github-dashboard:v1:organization-scope',
  pins: 'github-dashboard:v1:pinned-repositories',
  rateLimit: 'github-dashboard:v1:rate-limit',
  theme: 'github-dashboard:v1:theme',
  token: 'github-dashboard:session:github-token',
})

export const organizationLabel = login => ORGANIZATION_LABELS[login] || login

export const LEGAL_NOTICE =
  'This application is based on OrgExplorer by AOSSIE and has been modified for internal UMCCR use. Licensed under GNU GPL v3.'

export const UPSTREAM_URL = 'https://github.com/AOSSIE-Org/OrgExplorer'
export const GPL_URL = 'https://www.gnu.org/licenses/gpl-3.0.html'
