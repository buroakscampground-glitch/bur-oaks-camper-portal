import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultCampgroundBillingSettings } from '../lib/campground-settings.ts'
import {
  isAutomaticSiteCareTemplate,
  siteCareEnforcementFor,
  storedSiteCareChargeAmount,
  storedSiteCareTemplateKey,
} from '../lib/site-care-enforcement.ts'

test('automatic site care freezes the disclosed price into the notice', () => {
  const storedKey = storedSiteCareTemplateKey('weed-eat', true, 45)
  assert.equal(storedKey, 'auto:weed-eat:45.00')
  assert.equal(isAutomaticSiteCareTemplate(storedKey), true)
  assert.equal(storedSiteCareChargeAmount(storedKey), 45)

  const changedSettings = {
    ...defaultCampgroundBillingSettings,
    siteServices: defaultCampgroundBillingSettings.siteServices.map((service) => (
      service.type === 'full_weed_eat' ? { ...service, amount: 60 } : service
    )),
  }
  assert.equal(siteCareEnforcementFor(storedKey, changedSettings)?.chargeAmount, 45)
})

test('personal-property site care cannot become an automatic charged work order', () => {
  assert.equal(storedSiteCareTemplateKey('under-camper', true, 45), 'under-camper')
  assert.equal(siteCareEnforcementFor('under-camper', defaultCampgroundBillingSettings), null)
})

test('trash pickup is a saved thirty-dollar site service billed as a misc service', () => {
  const storedKey = storedSiteCareTemplateKey('trash-pickup', true, 30)
  const enforcement = siteCareEnforcementFor(storedKey, defaultCampgroundBillingSettings)
  assert.equal(enforcement?.chargeAmount, 30)
  assert.equal(enforcement?.serviceLabel, 'Trash pickup')
  assert.equal(enforcement?.serviceType, 'misc_service')
})
