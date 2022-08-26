/**
 * @description LWC to be used on the utility bar, to notify users when they are not the only one watching a given record
 */

import { LightningElement, wire, track } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import { subscribe, unsubscribe } from 'lightning/empApi';
import UserId from '@salesforce/user/Id';
import publishUpdate from '@salesforce/apex/WhosViewingUtility.publishUpdate';

// public with sharing class  {
//     @AuraEnabled
//     public static String (String recId, String viewingState) {

export default class WhosViewing extends LightningElement {
    @track recordId; // we will populated this from the lightning-navigation, as @api doesn't re-eval on page change
    @track count; // how many other users are watching the same record, should be 0 if current user is the only one

    subscription;

    /**
     * @description Called when the element is inserted into the DOM
     */
    connectedCallback() {
        this.count = 0;
        this.subscribeToEvent();
        // Set an Event Listener on before unload to rmeove subscriptions and publish a Leave
        window.addEventListener('beforeunload', this.beforeUnload.bind(this));
    }

    /**
     * @description Called when the element is inserted into the DOM
     */
    disconnectedCallback() {
        // sending a leaving event and unsubscribing
        this.beforeUnload();
    }

    /**
     * @description Subscribe to the Event Stream for the platform event Whos_Viewing__e
     * Publish an respond event, if someone else is also watching the same record
     */
    subscribeToEvent() {
        // Subscribe to the Event Stream for the platform event Whos_Viewing__e, get the last published event (-1)
        subscribe('/event/Whos_Viewing__e', -1, (event) => {
            console.log(JSON.stringify(event.data));
            // callback logic
            // verify that we have access to the payload user Id and check if is a different user
            if (event?.data?.payload?.CreatedById !== UserId) {
                // validate that we have access to the payload record Id and that the viewing state indicated loading a record page
                if (event?.data?.payload?.Record_Id__c === this.recordId && event?.data?.payload?.Viewing_State__c === 'Entered') {
                    // we need to update the count to note that other users are also viewing the record
                    this.count++;
                    // console debug msg
                    console.log('Another user entered the record');
                    // to notify the user that just started to watch the record, that at least 1 other user is looking at the record as well
                    // publish a "respond" event
                    publishUpdate({ recId: this.recordId, viewingState: 'Respond', responseTo: event?.data?.payload?.CreatedById || 'null' })
                        .then(() => {
                            // console debug msg
                            console.log('We notified the other user that we are already viewing the record');
                        })
                        .catch((error) => {
                            // console debug msg
                            console.error('Notifing the other user ended with an error: ', JSON.stringify(error));
                        });
                } else if (event?.data?.payload?.Record_Id__c === this.recordId && event?.data?.payload?.Viewing_State__c === 'Left') {
                    // console debug msg
                    console.log('The other user left the record page');
                    // we need to update the count to note that other users are no longer viewing the record
                    this.count--;
                } else if (event?.data?.payload?.Record_Id__c === this.recordId && event?.data?.payload?.Viewing_State__c === 'Respond') {
                    // we need to update the count to note that other users are also viewing the record - responded to us
                    this.count++;
                    // console debug msg
                    console.log('Another user already has the record open');
                }
            } else {
                // console debug msg
                console.log('Do nothing - Same user');
            }
        }).then((response) => {
            // Response contains the subscription information on subscribe call
            console.log('Subscription request sent to: ', JSON.stringify(response.channel));
            // updated the internal param on this cmp
            this.subscription = response;
        });
    }

    /**
     * @description Publish an event to notify that a user left the current record page and navigated elsewhere
     */
    leavingRecordEvent() {
        // this is a call to an apex method that will publish a platform event
        publishUpdate({ recId: this.recordId, viewingState: 'Left' })
            .then((response) => {
                // reset the cmp recordId to null
                this.recordId = null;
                // reset count of shared viewings
                this.count = 0;
                // console debug msg
                console.log('The user left the record', JSON.stringify(response));
            })
            .catch((error) => {
                // console debug msg
                console.error('The user left the record with an error: ', JSON.stringify(error));
            });
    }

    // this is an indication for us that the user has navigated out of a page, and that we should publish an event to notify the change

    /**
     * @description Enforces sending a leaving event and unsubscribing, as disconnectedCallback doesn't always work
     */
    beforeUnload() {
        // this is a call to an apex method that will publish a platform event for leaving the record
        this.leavingRecordEvent();

        // Invoke unsubscribe method of empApi
        unsubscribe(this.subscription, (response) => {
            console.log('unsubscribe() response: ', JSON.stringify(response));
            // Response is true for successful unsubscribe
        });
    }

    /**
     * @description Using the OOB lightning-navigation to keep track of page reference
     * as LWC doesn't re-evaluate params on page change when in the utility bar. We need a way to know when a user
     * navigated out of a record page, to indicate that they are no longer viewing it.
     */
    @wire(CurrentPageReference)
    setPageRef(pageRef) {
        // validate that the current recordId is NOT null or undefined + pageRef holds the attribute recordId before accessing it
        // and that the recordId is different from the one we currently hold in this cpm
        if (!this.isNullOrUndefined(this.recordId) && this.recordId !== pageRef?.attributes?.recordId) {
            // this is an indication for us that the user has navigated out of a page, and that we should publish an event to notify the change
            this.leavingRecordEvent();
        }
        // if the current recordId is null or undefined, but the pageRef HAS a value for the recordId attribute
        // that tells us that the user navigated from a generic page to a record page, or that the lwc rendered after page refresh
        else if (this.isNullOrUndefined(this.recordId) && !this.isNullOrUndefined(pageRef?.attributes?.recordId)) {
            // update the value of the cmp recordId with the new value
            this.recordId = pageRef.attributes.recordId;
            // this is an indication for us that the user has navigated into a record page, and that we should publish an event to notify the change
            // this is a call to an apex method that will publish a platform event
            publishUpdate({ recId: this.recordId, viewingState: 'Entered' })
                .then((response) => {
                    // we don't need to update the count here, because we don't know if other users are also viewing the record
                    // console debug msg
                    console.log('The user entered the record', JSON.stringify(response));
                })
                .catch((error) => {
                    // console debug msg
                    console.error('The user entered the record with an error: ', JSON.stringify(error));
                });
        }
    }

    /**
     * @description Method to consolidate a check for null or undifined
     */
    isNullOrUndefined(val) {
        return val === null || val === undefined;
    }
}
