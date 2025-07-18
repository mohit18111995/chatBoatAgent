public class EinsteinChatBotController {
   private static final String CLIENT_ID = 'xyz';
    private static final String CLIENT_SECRET = 'xyz';
    private static final String ORG_DOMAIN = 'https://spotones2024--mohit.sandbox.my.salesforce.com';
    private static final String API_HOST = 'https://api.salesforce.com';
    private static final String AGENT_ID = '0XxO40000002oVNKAY';

    @AuraEnabled(cacheable=false)
    public static String getAccessToken() {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(ORG_DOMAIN + '/services/oauth2/token');
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/x-www-form-urlencoded');
        req.setBody('grant_type=client_credentials' +
                    '&client_id=' + EncodingUtil.urlEncode(CLIENT_ID, 'UTF-8') +
                    '&client_secret=' + EncodingUtil.urlEncode(CLIENT_SECRET, 'UTF-8'));

        Http http = new Http();
        HttpResponse res = http.send(req);

        if (res.getStatusCode() == 200) {
            Map<String, Object> json = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
            return (String) json.get('access_token');
        } else {
            throw new AuraHandledException('Access token error: ' + res.getBody());
        }
    }

    @AuraEnabled
    public static Map<String, Object> startSession(String accessToken) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(API_HOST + '/einstein/ai-agent/v1/agents/' + AGENT_ID + '/sessions');
        req.setMethod('POST');
        req.setHeader('Authorization', 'Bearer ' + accessToken);
        req.setHeader('Content-Type', 'application/json');

        String body = JSON.serialize(new Map<String, Object>{
            'externalSessionKey' => String.valueOf(Crypto.getRandomLong()),
            'instanceConfig' => new Map<String, String>{ 'endpoint' => ORG_DOMAIN },
            'tz' => 'America/Los_Angeles',
            'variables' => new List<Object>{
                new Map<String, Object>{
                    'name' => '$Context.EndUserLanguage',
                    'type' => 'Text',
                    'value' => 'en_US'
                }
            },
            'featureSupport' => 'Streaming',
            'streamingCapabilities' => new Map<String, Object>{ 'chunkTypes' => new List<String>{ 'Text' } },
            'bypassUser' => true
        });

        req.setBody(body);
        HttpResponse res = new Http().send(req);

        if (res.getStatusCode() == 200) {
            return (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
        } else {
            throw new AuraHandledException('Start session error: ' + res.getBody());
        }
    }
}
