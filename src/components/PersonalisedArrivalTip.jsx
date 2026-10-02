import CustomerJourneyPrompt from './CustomerJourneyPrompt';
/** Existing black/gold treatment; no product/basket behaviour changes. */
export default function PersonalisedArrivalTip({tip}){
  return <div className="personalised-arrival-tip" style={{display:'contents'}}><CustomerJourneyPrompt state={tip?.state} onPrimary={tip?.open} onDismiss={()=>tip?.dismiss()}/></div>;
}
