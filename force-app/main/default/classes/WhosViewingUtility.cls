/**
 * @description Class to publish an event that a user started viewing a given record.
 * based on : https://github.com/jlondrejcka/Salesforce-Lightning-Component-Whos-Viewing-My-Record
 */
public with sharing class WhosViewingUtility {
    @AuraEnabled
    public static String publishUpdate(String recId, String viewingState, String responseTo) {
        // init val to return to view
        string response = '';

        // create a new event to be published to event bus
        List<Whos_Viewing__e> viewing = new List<Whos_Viewing__e>();
        viewing.add(new Whos_Viewing__e(Record_Id__c = recId, Viewing_State__c = viewingState, Response_To__c = responseTo));

        // call method to publish events
        List<Database.SaveResult> results = EventBus.publish(viewing);

        // inspect publishing results
        for (Database.SaveResult sr : results) {
            if (sr.isSuccess()) {
                System.debug('Successfully published event.');
                response = 'success';
            } else {
                for (Database.Error err : sr.getErrors()) {
                    System.debug('Error returned: ' + err.getStatusCode() + ' - ' + err.getMessage());
                }
                response = 'failed';
            }
        }
        // return outcome to the view
        return response;
    }
}