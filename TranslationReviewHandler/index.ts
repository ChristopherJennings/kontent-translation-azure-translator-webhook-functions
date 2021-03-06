import { AzureFunction, Context, HttpRequest } from '@azure/functions'
import { Constants } from '../Helpers/constants'
import * as KontentHelpers from '../Helpers/kontentHelpers'
import * as WebhookHelpers from '../Helpers/webhookHelpers'
import * as Models from '../Models'

// We don't want to break Azure's template, so we're disabling some rules selectively
// tslint:disable-next-line: only-arrow-functions typedef
const httpTrigger: AzureFunction = async function(context: Context, request: HttpRequest) {
  if (!WebhookHelpers.isRequestValid(request)) {
    return WebhookHelpers.getResponse('Invalid webhook. Not from Kontent or trigger is not a workflow step change', 400)
  }

  const workflowEventItem = WebhookHelpers.getWorkflowEventItem(request)

  if (!WebhookHelpers.isLanguageDefault(workflowEventItem.language.id)) {
    // Get basic data needed to do everything
    const defaultLanguageVariant = await KontentHelpers.getDefaultLanguageVariant(workflowEventItem.item.id)
    const t9nDetails = await KontentHelpers.getTranslationDetails(defaultLanguageVariant)

    // Set language completed timestamp in DLV
    KontentHelpers.updateTimestamp(t9nDetails, workflowEventItem.language.id, Models.Timestamps.Completed)
    await KontentHelpers.updateTranslationDetails(t9nDetails, defaultLanguageVariant)

    // if there's another language move it to pending WF step
    const nextLanguage = KontentHelpers.getNextLanguage(t9nDetails)
    if (nextLanguage) {
      await KontentHelpers.changeWorkflowStep(
        workflowEventItem.item.id,
        nextLanguage.id,
        Constants.kontentWorkflowStepIdTranslationPending
      )
    } else {
      // else move DLV to review workflow step
      if (!Constants.kontentWorkflowStepIdTranslationReview) {
        throw Error('Translation review workflow step ID is undefined')
      }

      await KontentHelpers.changeWorkflowStep(
        workflowEventItem.item.id,
        Constants.kontentDefaultLanguageId,
        Constants.kontentWorkflowStepIdTranslationReview
      )
    }
  }

  return WebhookHelpers.getResponse()
}

export default httpTrigger
