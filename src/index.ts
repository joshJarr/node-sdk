import axios, { RawAxiosRequestHeaders } from "axios";
import { v4 as uuidv4 } from "uuid";
import {
  AccessTokenResponse,
  DeleteResponse,
  EventStateChange,
  InitialiseAndProgressUser,
  Timeline,
  TimelineEvent,
  TokenResponse,
  User,
  UserResponse,
  UserTimelineEventList,
  UserTimelineEventDetail,
} from "./types.js";


const DEFAULT_API_VERSION = "1";
const SECRET_API_KEY_PREFIX = "s_";


class Fictioneers {
  private readonly apiKey: string;
  private userId: string;
  private accessToken: string | null;
  private accessTokenExpiry: null | number;
  private readonly _endpoint: string;

  /**
   * A lightweight SDK interface to the Fictioneers API
   */
  constructor({
    apiKey,
    userId = null,
    apiVersion = DEFAULT_API_VERSION,
  }: {
    apiKey: string;
    userId?: null | string;
    apiVersion?: string;
  }) {
    if (apiKey.indexOf(SECRET_API_KEY_PREFIX) === 0 && typeof window !== "undefined") {
      console.warn(
        "Warning: It looks like you're using a secret API key client-side, please consider using a visible API key"
      );
    }

    if (userId == null) {
      userId = Fictioneers._uuidv4();
    }

    this.apiKey = apiKey;
    this.userId = userId;
    this.accessToken = null; // only create this the first time when needed
    this.accessTokenExpiry = null;
    this._endpoint = `https://api.fictioneers.co.uk/v${apiVersion}`;
  }

  /**
   * Generate and save a new ID Token which can be used to authenticate against the Audience APIs.
   * @returns {object}
   */
  async getAccessToken(): Promise<AccessTokenResponse> {
    const response = await axios.post(
      `${this._endpoint}/auth/token`,
      {
        user_id: this.userId,
      },
      {
        headers: this._getAuthHeaderSecretKey()
      }
    );

    const accessToken = response.data as TokenResponse;
    this.accessToken = accessToken.access_token;
    return {
      accessToken: accessToken.access_token,
      expiresIn: accessToken.expires_in,
    };
  }

  /**
   * Create a uuid v4 string
   * @returns {string}
   */
  static _uuidv4 = (): string => {
    return uuidv4();
  };

  /**
   * If necessary, generate and save a new access token which can be used to authenticate against the Audience APIs.
   * @returns {object}
   */
  async setAccessToken(): Promise<AccessTokenResponse> {
    if (
      !this.accessToken ||
      this.accessTokenExpiry == null ||
      this.accessTokenExpiry < Date.now()
    ) {
      const { accessToken, expiresIn } = await this.getAccessToken();
      this.accessToken = accessToken;
      this.accessTokenExpiry = Date.now() + (expiresIn - 10) * 1000; // when the access token will expire, minus a period of 10 seconds
    }
    return {
      accessToken: this.accessToken,
      expiresIn: (this.accessTokenExpiry - Date.now()) / 1000 + 10,
    };
  }

  /**
   * Access the userId that may have been auto-generated by the SDK or supplied in the constructor.
   * @returns {string}
   */
  getUserId(): string {
    return this.userId;
  }

  /**
   * Sets the userId after the constructor is called (i.e., overwrites the userId passed to the constructor, or replaces the default created uuidv4)
   * @param {string} userId
   */
  async setUserId({ userId }: { userId: string }): Promise<void> {

    // If the user ID being set is already the current user ID, do nothing.
    if (userId === this.userId) {
      return;
    }

    if (userId.length) {
      this.userId = userId.toString();
      this.accessToken = null;
      await this.setAccessToken();
    } else {
      throw new Error("The parameter userId must have length");
    }
  }

  /**
   * Returns a boolean to denote whether the API key is a secret key
   * @returns {boolean}
   */
  private _isKeySecret(): boolean {
    return this.apiKey.indexOf(SECRET_API_KEY_PREFIX) === 0;
  }

  /**
   * Returns key/value pairs of common HTTP request headers to the Fictioneers API.
   * @returns {boolean}
   */
  private _commonRequestHeaders(): RawAxiosRequestHeaders {
    let commonHeaders: RawAxiosRequestHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "application/json",
    }
    return commonHeaders;
  }

  private _getAuthHeaderSecretKey(): RawAxiosRequestHeaders {
    return {
      Authorization: this.apiKey,
    };
  }

  private async _getAuthHeadersAudienceEndpoints(): Promise<RawAxiosRequestHeaders> {

    let headers: RawAxiosRequestHeaders = {}

    if (this._isKeySecret()) {
      headers['Authorization'] = this.apiKey;
      headers['Fictioneers-User-ID'] = this.userId;
    } else {
      await this.setAccessToken();
      if (!this.accessToken) {
        throw new Error(
          "Could not assemble auth headers with bearer - no access token"
        );
      }
      headers['Authorization'] = `Bearer ${this.accessToken}`
    }

    return headers;
  }

  private async _doFetch<T>({
    url,
    method = "GET",
    auth = "bearer",
    body = null,
    deprecated = false,
  }: {
    url: string;
    method?: "DELETE" | "GET" | "POST" | "PATCH";
    auth?: "bearer" | "key";
    body?: null | any;
    deprecated?: boolean;
  }): Promise<T> {

    let authHeaders;
    if (auth === "bearer") {
      authHeaders = await this._getAuthHeadersAudienceEndpoints();
    } else {
      authHeaders = this._getAuthHeaderSecretKey();
    }

    let headers = {...this._commonRequestHeaders(), ...authHeaders};

    let response;
    switch (method) {
      case "POST":
        response = await axios.post(this._endpoint + url, body || {}, {
          headers,
        });
        break;
      case "DELETE":
        response = await axios.delete(this._endpoint + url, { headers });
        break;
      case "GET":
        response = await axios.get(this._endpoint + url, { headers });
        break;
      case "PATCH":
        response = await axios.patch(this._endpoint + url, body || {}, {
          headers,
        });
        break;
    }
    if (method === "DELETE") {
      return {
        data: null,
        error: response.status >= 400 ? response.statusText : null,
        meta: null,
        status: 204,
      } as T;
    }

    const responseData = response.data;
    if (deprecated && !Array.isArray(responseData)) {
      responseData.error =
        (responseData.error ? responseData.error : "") +
        " Notice: this API endpoint has been deprecated and will be removed in a future version of this SDK.";
    }
    return responseData;
  }

  /* Admin */
  /* Admin service to programmatically manage timelines and timeline users. A secret API Key is required in the HTTP Authorization header. */

  /**
   * List all published timelines which users can be placed on.
   * @returns {Promise}
   * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#list-all-published-timelines
   */
  async getTimelines(): Promise<Timeline[]> {
    return this._doFetch({
      url: "/timelines",
      auth: "key",
    });
  }

  /**
   * Representation of a single timeline.
   * @param {string} timelineId
   * @returns {Promise}
   * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#retrieves-timeline
   */
  async getTimeline({ timelineId }: { timelineId: string }): Promise<Timeline> {
    return this._doFetch({
      url: `/timelines/${timelineId}`,
      auth: "key",
    });
  }

  /**
   * Representation of a single timeline's events and metadata.
   * @param {string} timelineId
   * @returns {Promise}
   * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#lists-all-timeline-events-2
   */
  async getTimelineEvents({
    timelineId,
  }: {
    timelineId: string;
  }): Promise<TimelineEvent[]> {
    return this._doFetch({
      url: `/timelines/${timelineId}/timeline-events`,
      auth: "key",
    });
  }

  /**
   * List of all users on timeline.
   * @param {string} timelineId
   * @returns {Promise}
   * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#list-all-timeline-users
   */
  async getTimelineUsers({
    timelineId,
  }: {
    timelineId: string;
  }): Promise<User[]> {
    return this._doFetch({
      url: `/timelines/${timelineId}/users`,
      auth: "key",
    });
  }

  /**
   * Delete all users on a timeline.
   * @param {string} timelineId
   * @returns {Promise}
   * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#delete-all-timeline-users
   */
  async deleteTimelineUsers({
    timelineId,
  }: {
    timelineId: string;
  }): Promise<DeleteResponse> {
    return this._doFetch({
      url: `/timelines/${timelineId}/users`,
      method: "DELETE",
      auth: "key",
    });
  }

  /**
   * Retrieves timeline user.
   * @param {string} timelineId
   * @param {string} userId
   * @returns {Promise}
   * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#retrieves-timeline-user
   */
  async getTimelineUser({
    timelineId,
    userId = null,
  }: {
    timelineId: string;
    userId?: null | string;
  }): Promise<User> {
    if (userId == null) {
      userId = this.userId;
    }
    return this._doFetch({
      url: `/timelines/${timelineId}/users/${userId}`,
      auth: "key",
    });
  }

  /**
   * Delete timeline user.
   * @param {string} timelineId
   * @param {string} userId
   * @returns {Promise}
   * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#delete-timeline-user
   */
  async deleteTimelineUser({
    timelineId,
    userId = null,
  }: {
    timelineId: string;
    userId?: null | string;
  }): Promise<DeleteResponse> {
    if (userId == null) {
      userId = this.userId;
    }
    return this._doFetch({
      url: `/timelines/${timelineId}/users/${userId}`,
      method: "DELETE",
      auth: "key",
    });
  }

  /**
   * Returns all event state changes filtered by timeline.
   * @param {string} timelineId
   * @returns {Promise}
   * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#list-all-event-state-changes-for-timeline
   */
  async getTimelineEventStateChanges({
    timelineId,
  }: {
    timelineId: string;
  }): Promise<EventStateChange[]> {
    return this._doFetch({
      url: `/timelines/${timelineId}/event-state-changes/`,
      auth: "key",
    });
  }

  /* Users */
  /* User from the authentication token. */

  /**
   * Retrieve detailed representation of the current user.
   * @returns {Promise}
   * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#retrieve-current-user
   */
  async getUser(): Promise<UserResponse> {
    return this._doFetch({
      url: "/users/me",
    });
  }

  /**
   * Delete the user and any user associated objects from the current timeline.
   * @returns {Promise}
   * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#delete-current-user
   */
  async deleteUser(): Promise<DeleteResponse> {
    return this._doFetch({
      url: "/users/me",
      method: "DELETE",
    });
  }

  /**
   * Create a new audience user for a Fictioneers powered experience.
   * @param {string} timelineId
   * @param {boolean} disableTimeGuards
   * @param {boolean} pauseAtBeats
   * @returns {Promise}
   * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#create-new-audience-user
   */
  async createUser({
    timelineId,
    disableTimeGuards = false,
    pauseAtBeats = false,
    maxSteps = null,
  }: {
    timelineId: string;
    disableTimeGuards?: boolean;
    pauseAtBeats?: boolean;
    maxSteps? : number | null;
  }): Promise<UserResponse> {
    // TODO - does the user exist already?
    // await this.getUser()

    return this._doFetch<UserResponse>({
      url: "/users",
      method: "POST",
      body: {
        published_timeline_id: timelineId,
        timezone: "Europe/London",
        disable_time_guards: disableTimeGuards,
        pause_at_beats: pauseAtBeats,
        max_steps: maxSteps,
      },
    });
  }

  /** Shortcut / combined method to initialise a new user and progress them */
  async initialiseAndProgressUser({
    timelineId,
    disableTimeGuards = false,
    pauseAtBeats = false,
    maxSteps = null,
  }: {
    timelineId: string;
    disableTimeGuards?: boolean;
    pauseAtBeats?: boolean;
    maxSteps?: number | null;
  }): Promise<InitialiseAndProgressUser> {
    // first get or create the user, and get their story state
    let user;
    const getUserResponse = await this.getUser();
    if (getUserResponse.data == null) {
      const createUserResponse = await this.createUser({
        timelineId,
        disableTimeGuards,
        pauseAtBeats,
        maxSteps,
      });
      user = createUserResponse.data;
    }

    // next get their timeline events
    const userTimelineEventsResponse = await this.getUserTimelineEvents();
    const userTimelineEvents = userTimelineEventsResponse.data || [];
    return {
      user: user,
      userTimelineEvents: userTimelineEvents,
    };
  }


  /**
   * Progress user step position along the timeline.
   * @param {(null|number)} maxSteps
   * @param {boolean} pauseAtBeats
   * @returns {Promise}
   * @link https://storage.googleapis.com/fictioneers-developer-docs/build/index.html#progress-timeline-events
   */
  async progressUserStep({
    maxSteps = null,
    pauseAtBeats = true,
  }: {
    maxSteps?: number | string | null;
    pauseAtBeats?: boolean;
  }): Promise<UserResponse> {
    if (maxSteps !== null && typeof maxSteps == "string") {
      maxSteps = parseInt(maxSteps as string);
    }
    return this._doFetch({
      url: "/users/me/progress-step",
      method: "POST",
      body: {
        max_steps: maxSteps,
        pause_at_beats: pauseAtBeats,
      },
    });
  }

  /* User timeline events */

  /**
   * Gets all user timeline events
   * @returns {Promise}
   */
  async getUserTimelineEvents(): Promise<UserTimelineEventList> {
    return this._doFetch({
      url: "/user-timeline-events",
    });
  }

  /**
   * Updates the "from" timeline event as `VISITED`, and  the "to" timeline event as `ACTIVE`.
   * @param {string} timelineEventId
   * @param {string} linkId
   * @returns {Promise}
   */
  async followLinkUserTimelineEvent({
    timelineEventId,
    linkId,
  }: {
    timelineEventId: string;
    linkId: string;
  }): Promise<UserTimelineEventDetail> {
    return this._doFetch({
      url: `/user-timeline-events/${timelineEventId}/follow-link`,
      method: "POST",
      body: {
        link_id: linkId,
      },
    });
  }
}

export * from "./types.js";
export default Fictioneers;
