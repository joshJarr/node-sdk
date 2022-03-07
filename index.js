import fetch from "node-fetch"
import { v4 as uuidv4 } from 'uuid'

class Fictioneers {
    /**
     * A lightweight SDK interface to the Fictioneers API
     * @param {string} apiSecretKey 
     * @param {(null|string)} userId 
     * @returns {object}
     */
    constructor({apiSecretKey, userId = null}) {
        if(typeof window !== 'undefined'){
            throw new Error("This API is for server-side usage only. Your apiSecretKey should never be visible client-side.")
        }

        if(userId == null){
            userId = Fictioneers._uuidv4()
        }
        
        if(!(this instanceof Fictioneers)){
            return new Fictioneers(apiSecretKey, userId)
        }

        this.apiSecretKey = apiSecretKey
        this.userId = userId
        this.accessToken = null // only create this the first time when needed
        this.accessTokenExpiry = null
        this._endpoint = "https://api.fictioneers.co.uk/api/v1"
    }

    /**
     * generate and save a new ID Token which can be used to authenticate against the Audience APIs.
     * @param {string} userId 
     * @param {string} apiSecretKey 
     * @returns {object}
     */
    static getAccessToken = async({userId, apiSecretKey}) => {
        const response = await fetch(Fictioneers._endpoint + "/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": apiSecretKey
            },
            body: JSON.stringify({
                user_id: userId
            })
        })

        const accessToken = await response.json()
        return {
            "accessToken": accessToken.id_token,
            "expiresIn": accessToken.expires_in
        }
    }

    /**
     * Create a uuid v4 string
     * @returns {string}
     */
    static _uuidv4 = () => {
        return uuidv4()
    }

    /**
     * If necessary, generate and save a new ID Token which can be used to authenticate against the Audience APIs.
     */
    async setAccessToken() {
        if(!this.accessToken || this.accessTokenExpiry < Date.now()){
            const {accessToken, expiresIn} = await Fictioneers.getAccessToken({
                userId: this.userId,
                apiSecretKey: this.apiSecretKey
            })
            this.accessToken = accessToken
            this.accessTokenExpiry = Date.now() + ((expiresIn - 10) * 1000) // when the access token will expire, minus a period of 10 seconds
        }
    }

    /**
     * Access the userId that may have been auto-generated by the SDK or supplied in the constructor.
     * @returns {string}
     */
    getUserId(){
        return this.userId
    }

    /**
     * Sets the userId after the constructor is called (i.e., overwrites the userId passed to the constructor, or replaces the default created uuidv4)
     * @param {string} userId 
     */
    setUserId({userId}){
        if(userId.length){
            this.userId = userId.toString()
            this.accessToken = null
            this.setAccessToken()
        } else {
            throw new Error("The parameter userId must have length")
        }
    }

    _getAuthHeaderSecretKey(){
        return {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": this.apiSecretKey
        }
    }

    _getAuthHeadersBearer(){
        await this.setAccessToken()
        return {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": `Bearer ${this.accessToken}`
        }
    }

    async _doFetch({url, method = "GET", auth = "bearer", body = null, additionalHeaders = []}) {
        let headers
        if(auth == "bearer"){
            headers = this._getAuthHeadersBearer()
        } else {
            headers = this._getAuthHeaderSecretKey()
        }
        for (const [key, value] of additionalHeaders.entries()){
            headers[key] = value
        }
        const response = await fetch(this._endpoint + url, {
            method: method,
            headers: headers,
            body: JSON.stringify(body)
        })
        return response.json()
    }

    /* Admin */
    /* Admin service to programatically manage timelines and timeline users. A secret API Key is required in the HTTP Authorization header. */

    /**
     * List all published timelines which users can be placed on.
     * @returns {Promise}
     * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#list-all-published-timelines
     */
    async getTimelines() {
        return this._doFetch({
            url: "/timelines",
            auth: "key"
        })
    }

    /**
     * Representation of a single timeline.
     * @param {string} timelineId 
     * @returns {Promise}
     * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#retrieves-timeline
     */
    async getTimeline({timelineId}) {
        return this._doFetch({
            url: `/timelines/${timelineId}`,
            auth: "key"
        })
    }

    /**
     * List of all users on timeline.
     * @param {string} timelineId 
     * @returns {Promise}
     * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#list-all-timeline-users
     */
    async getTimelineUsers({timelineId}) {
        return this._doFetch({
            url: `/timelines/${timelineId}/users`,
            auth: "key"
        })
    }

    /**
     * Delete all users on a timeline.
     * @param {string} timelineId 
     * @returns {Promise}
     * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#delete-all-timeline-users
     */
    async deleteTimelineUsers({timelineId}) {
        return this._doFetch({
            url: `/timelines/${timelineId}/users`,
            method: "DELETE",
            auth: "key"
        })
    }

    /**
     * Retrieves timeline user.
     * @param {string} timelineId 
     * @param {string} userId 
     * @returns {Promise}
     * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#retrieves-timeline-user
     */
    async getTimelineUser({timelineId, userId = null}) {
        if(userId == null){
            userId = this.userId
        }
        return this._doFetch({
            url: `/timelines/${timelineId}/users/${userId}`,
            auth: "key"
        })
    }

    /**
     * Delete timeline user.
     * @param {string} timelineId 
     * @param {string} userId 
     * @returns {Promise}
     * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#delete-timeline-user
     */
    async deleteTimelineUser({timelineId, userId = null}) {
        if(userId == null){
            userId = this.userId
        }
        return this._doFetch({
            url: `/timelines/${timelineId}/users/${userId}`,
            method: "DELETE",
            auth: "key"
        })
    }

    /**
     * Returns all event state changes filtered by timeline.
     * @param {string} timelineId 
     * @returns {Promise}
     * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#list-all-event-state-changes-for-timeline
     */
    async getTimelineEventStateChanges({timelineId}) {
        return this._doFetch({
            url: `/timelines/${timelineId}/event-state-changes/`,
            auth: "key"
        })
    }

    /* Users */
    /* User from the authentication token. */

    /**
     * Retrieve detailed representation of the current user.
     * Optionally include the serialized user narrative by including a include_narrative_state GET param.
     * @returns {Promise}
     * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#retrieve-current-user
     */
    async getUser({includeNarrativeState = false}) {
        if(includeNarrativeState !== true){
            includeNarrativeState = false
        }
        return this._doFetch({
            url: "/users/me",
            body:{
                "include_narrative_state": includeNarrativeState
            }
        })
    }

    /**
     * Delete the user and any user associated objects from the current timeline.
     * @returns {Promise}
     * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#delete-current-user
     */
    async deleteUser() {
        return this._doFetch({
            url: "/users/me",
            method: "DELETE"
        })
    }

    /**
     * Update the display name of the current user.
     * @param {string} displayName 
     * @returns {Promise}
     * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#update-current-user
     */
    async updateUser({displayName}) {
        return this._doFetch({
            url: "/users/me",
            method: "PATCH",
            body: {
                "display_name": displayName
            }
        })
    }

    /**
     * Create a new audience user for a Fictioneers powered experience.
     * @param {string} timelineId 
     * @param {boolean} disableTimeGuards 
     * @param {boolean} pauseAtBeats 
     * @returns {Promise}
     * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#create-new-audience-user
     */
    async createUser({timelineId, disableTimeGuards = false, pauseAtBeats = false}) {
        
        // TODO - does the user exist already? 
        // await this.getUser()
        
        if(disableTimeGuards !== true) {
            disableTimeGuards = false
        }
        if(pauseAtBeats !== true){
            pauseAtBeats = false
        }

        return this._doFetch({
            url: "/users",
            method: "POST",
            body: {
                "published_timeline_id": timelineId,
                "timezone": "Europe/London",
                "disable_time_guards": disableTimeGuards,
                "pause_at_beats": pauseAtBeats
            }
        })
    }

    /* User story state */
    /* User story state for the authenticated user. */

    /**
     * Representation of authenticated users narrative story state.
     * @returns {Promise}
     * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#retrieves-user-narrative-state
     */
    async getUserStoryState() {
        return this._doFetch({
            url: "/user-story-state",
        })
    }
    
    /**
     * Progress events based on the authenticated user available transition events.
     * @param {(null|number)} maxSteps 
     * @param {boolean} pauseAtBeats 
     * @returns {Promise}
     * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#progress-timeline-events
     */
    async progressUserStoryStateEvents({maxSteps = null, pauseAtBeats = true}) {
        if(pauseAtBeats !== false){
            pauseAtBeats = true
        }
        if(maxSteps !== null){
            maxSteps = parseInt(maxSteps)
        }
        return this._doFetch({
            url: "/user-story-state/progress-events",
            method: "POST",
            body: {
                "max_steps": maxSteps,
                "pause_at_beats": pauseAtBeats
            }
        })
    }


    /* User timeline hooks */
    /* Timeline hooks for the authenticated user. */

    /**
     * List endpoint for user timeline events implicitly filtered by the authenticated user ID.
     * @returns {Promise}
     * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#lists-all-timeline-hooks
     */
    async getUserTimelineHooks() {
        return this._doFetch({
            url: "/user-timeline-hooks",
        })
    }



    /* User interactables */
    /* Interactables for the authenticated user. */

    /**
     * List endpoint for interactables implicitly filtered by the authenticated user ID.
     * @returns {Promise}
     * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#lists-all-user-interactables
     */
    async getUserInteractables() {
        return this._doFetch({
            url: "/user-interactables",
        })
    }

    /**
     * Retrieves a specified user interactable
     * @param {string} interactableId 
     * @returns {Promise}
     * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#retrieves-user-interactable
     */
    async getUserInteractable({interactableId}) {
        return this._doFetch({
            url: `/user-interactables/${interactableId}`,
        })
    }

    /**
     * Update a specified user interactable
     * @param {string} interactableId 
     * @param {string} state 
     * @returns {Promise}
     * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#update-user-interactable
     */
    async updateUserInteractable({interactableId, state}) {
        return this._doFetch({
            url: `/user-interactables/${interactableId}`,
            method: "PATCH",
            body: {
                "state": state
            }
        })
    }


    /* Timeline interactables */
    /* All the interactables referenced on the users current timeline (irrespective of their current position). */

    /**
     * List endpoint for timeline interactables (filterable by type).
     * @returns {Promise}
     * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#lists-timeline-interactables
     */
    async getTimelineInteractables() {
        return this._doFetch({
            url: "/timeline-interactables",
        })
    }

    /**
     * Retrieves a specified timeline interactable
     * @param {string} interactableId 
     * @returns {Promise}
     * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#retrieves-timeline-interactable
     */
    async getTimelineInteractable({interactableId}) {
        return this._doFetch({
            url: `/timeline-interactables/${interactableId}`,
        })
    }
    

    /* Timeline events */
    /* All the events referenced on the users current timeline (irrespective of their current posiiton). */

    /**
     * List endpoint for timeline events.
     * @returns {Promise}
     * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#lists-all-timeline-events
     */
    async getTimelineEvents() {
        return this._doFetch({
            url: "/timeline-events",
        })
    }
}

export default Fictioneers
