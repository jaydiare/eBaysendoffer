const EBAY_APP_ID = "CLIENT_ID";
const EBAY_CERT_ID = "CLIENT_SECRET";
const EBAY_RU_NAME = "RUName";
const EBAY_OAUTH_LOGIN_URL = "AUTH_URI";
const EBAY_BASE_URL = "https://api.ebay.com/sell/negotiation/v1/";
const MARKETPLACES = ["EBAY_CA"]; // Add more marketplaces if needed
const DISCOUNT_PERCENTAGE = 5; // Fixed 5% discount
const DISCOUNT_TYPE = "PERCENTAGE_OFF"; // Ensures percentage discount is applied

function getStoredToken() {
    return PropertiesService.getScriptProperties().getProperty("EBAY_AUTH_TOKEN");
}

function getStoredRefreshToken() {
    return PropertiesService.getScriptProperties().getProperty("EBAY_REFRESH_TOKEN");
}

function checkAndRefreshToken(forceRefresh = false) {
    let token = getStoredToken();
    if (!token || forceRefresh) {
        Logger.log("🔄 Refreshing eBay Access Token...");
        return forceRefreshToken();
    }
    return token;
}

function forceRefreshToken() {
    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) {
        Logger.log("❌ ERROR: No refresh token available.");
        return null;
    }
    
    const url = "https://api.ebay.com/identity/v1/oauth2/token";
    const payload = {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: "https://api.ebay.com/oauth/api_scope/sell.marketing https://api.ebay.com/oauth/api_scope/sell.inventory"
    };
    
    const headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Basic " + Utilities.base64Encode(EBAY_APP_ID + ":" + EBAY_CERT_ID)
    };
    
    try {
        let response = UrlFetchApp.fetch(url, { method: "POST", headers: headers, payload: payload, muteHttpExceptions: true });
        let data = JSON.parse(response.getContentText());
        if (data.access_token) {
            PropertiesService.getScriptProperties().setProperty("EBAY_AUTH_TOKEN", data.access_token);
            Logger.log("✅ Token refreshed successfully.");
            return data.access_token;
        } else {
            Logger.log("❌ ERROR: Failed to refresh token: " + response.getContentText());
            return null;
        }
    } catch (error) {
        Logger.log("❌ ERROR: Failed to refresh token: " + error.message);
        return null;
    }
}

function getEligibleListings(marketplace) {
    let token = checkAndRefreshToken();
    if (!token) return [];
    
    let url = `https://api.ebay.com/sell/negotiation/v1/find_eligible_items?limit=10&offset=0`;
    const headers = {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Language": "en-CA, fr-CA",
        "X-EBAY-C-MARKETPLACE-ID": marketplace
    };
    
    try {
        let response = UrlFetchApp.fetch(url, { method: "GET", headers: headers, muteHttpExceptions: true });
        let jsonResponse = JSON.parse(response.getContentText());
        Logger.log("🔍 API Response: " + JSON.stringify(jsonResponse, null, 2));
        return jsonResponse.eligibleItems || [];
    } catch (error) {
        Logger.log(`❌ ERROR: Failed to fetch listings: ${error.message}`);
        return [];
    }
}

function sendOfferToInterestedBuyers(listings) {
    let token = checkAndRefreshToken();
    if (!token) return [];
    
    const url = "https://api.ebay.com/sell/negotiation/v1/send_offer_to_interested_buyers";
    const headers = {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Language": "en-CA, fr-CA",
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_CA"
    };
    let successListings = [];

    listings.forEach(listing => {
        let requestBody = {
            "message": "Great News! get this offer now!. Follow my eBay store, I post new cards every week",
            "offeredItems": [{
                "listingId": listing.listingId,
                "quantity": "1",
                "discountPercentage": `${DISCOUNT_PERCENTAGE}`
            }],
            "allowCounterOffer": false,
            "offerDuration": { "unit": "DAY", "value": "2" }
        };
        
        try {
            let response = UrlFetchApp.fetch(url, { method: "POST", headers: headers, payload: JSON.stringify(requestBody), muteHttpExceptions: true });
            let jsonResponse = JSON.parse(response.getContentText());
            if (response.getResponseCode() === 201) {
                Logger.log(`✅ Offer sent successfully: ${JSON.stringify(jsonResponse)}`);
                successListings.push(listing.listingId);
            } else {
                Logger.log(`❌ ERROR: Offer request failed. Response: ${JSON.stringify(jsonResponse)}`);
            }
        } catch (error) {
            Logger.log(`❌ ERROR: Failed to send offer: ${error.message}`);
        }
    });
    return successListings;
}

function sendEmailNotification(listings) {
    let recipient = "EMAIL_RECEIVER";
    let subject = "eBay Offers Sent Report";
    let body = "Offers were successfully sent for the following listings:\n\n";
    listings.forEach(listing => {
        body += `Listing ID: ${listing}\n`;
    });
    MailApp.sendEmail(recipient, subject, body);
    Logger.log("📧 Email notification sent.");
}

function sendEbayOffers() {
    let token = checkAndRefreshToken();
    if (!token) {
        Logger.log("❌ ERROR: Could not obtain a valid token.");
        return;
    }
    
    MARKETPLACES.forEach(marketplace => {
        let listings = getEligibleListings(marketplace);
        if (listings.length > 0) {
            let successfulListings = sendOfferToInterestedBuyers(listings);
            sendEmailNotification(successfulListings);
        } else {
            Logger.log(`⚠️ No eligible listings found for ${marketplace}`);
        }
    });
}
