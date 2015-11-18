'use strict';
var jobFormApp = angular.module('jobFormApp', ['angucomplete-alt', 'angular-cache','rzModule']);

jobFormApp.controller('jobFormController', ['$scope','$http','$log', 'jobFormService','$timeout', function($scope, $http, $log, jobFormService, $timeout)
{
    $scope.data = {};

    var STATUS =
    {
        SUBMIT_START: 0,
        SUBMIT_SUCCESS: 1,
        SUBMIT_FAILURE : 2,
        CANCEL: 3,
        JOB_PAGE_LOAD_SUCCESS: 4,
        JOB_PAGE_LOAD_FAILURE: 5

    };

    $timeout(function()
    {
        $scope.data.experience=2;
        $scope.data.ctc=3;
        
    });

    Object.prototype.getKeyByValue = function( value ) {
        for( var prop in this ) {
            if( this.hasOwnProperty( prop ) ) {
                if( this[ prop ] === value )
                    return prop;
            }
        }
    };


    /**
     * set the auth token on $http
     */
    $scope.$watch('auth_token', function()
    {


        if($scope.auth_token && $scope.auth_token.length > 0){
        	
        	$http.defaults.headers.common['X-AKOSHA-AUTH'] = $scope.auth_token;
            $scope.init();



        }
    });

    $scope.init=function(){


        jobFormService.getLookupJobAttributes().success(function(data)
        {
            var attributes = data;

            for(var i =0;i < attributes.length; ++i)
            {

                var attrObj = attributes[i];
                var attrId = attrObj.attribute_id;
                var attrValues=[];

                attrObj.values.forEach(function(attrValue) {
                    var obj={
                        "id":attrValue,
                        "title":attrValue
                    }
                    attrValues.push(obj);
                });

                if(attrId==1){
                    $scope.jobDegrees =attrValues;

                }else if(attrId==3){
                    $scope.jobCategories =attrValues;
                }
            }
            getJobProfile();

            $timeout(function()
            {
                if(!$scope.data.degree)
                    $scope.data.degree = $scope.jobDegrees[1].id;

                if(!$scope.data.category)
                    $scope.data.category = $scope.jobCategories[0].id;
            });


        }).error(function()
        {

            $log.error("Error getting lookup job attributes");

        });
    };


    function getJobProfile()
    {
        jobFormService.getJobProfile().success(function(data)
        {
            var attributes = data.attributes;

            for(var i =0;i < attributes.length; ++i)
            {

                var attrObj = attributes[i];
                var attrId = attrObj.attribute_id;
                var attrVal = attrObj.attribute_value;

                var modelName = attrMap.getKeyByValue(attrId);
                $scope.data[modelName] = attrVal;

            }
            jobFormService.callDevice(null, STATUS.JOB_PAGE_LOAD_SUCCESS);
        }).error(function(data)
        {

           $log.error("Error getting form data");
            jobFormService.callDevice(null, STATUS.JOB_PAGE_LOAD_SUCCESS);

        });

    }


    var attrMap =
    {
        "degree": 1,
        "location": 2,
        "category": 3,
        "experience": 4,
        "ctc": 5

    };
    var lableMap =
    {
        "1": "Education",
        "2": "Location",
        "3": "Job Category",
        "4": "Experience (In Years)",
        "5": "Expected Salary (In Lakhs per annum)"

    };

    $scope.submitForm = function()
    {

        jobFormService.callDevice(null, STATUS.SUBMIT_START);

        var attributes = [];

        //location input if empty then add in attributes
        if( !$scope.data.hasOwnProperty('location') ){
        	$scope.data['location'] = "";
        }
        
        for(var key in $scope.data)
        {
            if ($scope.data.hasOwnProperty(key)) {
                var attrId = attrMap[key];
                var attrObj = {"attribute_id":  attrId, "attribute_value": $scope.data[key]};

                attributes.push(attrObj);
            }


        }

        jobFormService.saveJobProfile({"attributes": attributes}).success(function() {

            // Forn was saved successfully;


            var chatMsg = "Please find me a job"+"\n";

            attributes.forEach(function(attribute) {
            	
            	//set location as open
            	if( attribute.attribute_id == 2 && attribute.attribute_value == "" ){
            		
            		attribute.attribute_value = 'open';
            	}
            	
            	//change chat message for floor values
            	if( ( attribute.attribute_id == 4 || attribute.attribute_id == 5 ) && 
            			( attribute.attribute_value == 0 ) ){
            		
            		attribute.attribute_value = 'less than 1';
            	}
            	
            	//change chat message for ceiling values
            	if( ( attribute.attribute_id == 4  && attribute.attribute_value == 11 ) ||
            		( attribute.attribute_id == 5  && attribute.attribute_value == 16 ) ){
            		
            		attribute.attribute_value = "greater than " + parseInt(attribute.attribute_value-1).toString();
            	}
            	
                var lable = lableMap[attribute.attribute_id];
                chatMsg=chatMsg+lable+" - "+attribute.attribute_value+"\n";
            });

            $log.debug(chatMsg);

            jobFormService.callDevice(chatMsg, STATUS.SUBMIT_SUCCESS);

        }).error(function(data, status, headers, config)
        {
            var msg = "There was an error saving the form";

            $log.error("Error saving form");

            // indicate failure callback to android
            jobFormService.callDevice(msg, STATUS.SUBMIT_FAILURE);

        });

    };
    $scope.isUndefinedOrNull = function(val) {
        return angular.isUndefined(val) || val === null || val == "" || val.trim()=="";
    };


    /**
     * User is cancelling the form
     */
    $scope.cancelForm = function()
    {

        // indicate callback to device
        jobFormService.callDevice(null, STATUS.CANCEL);

        // async sent message to agent

        var msg = "User has cancelled the form";

        jobFormService.sendMessageToAgent(msg).success(function()
        {



        }).error(function()
        {

            $log.error("Error sending message to agent");

        });

    }

}]);


jobFormApp.service('jobFormService', function($http, CacheFactory)
{

    if(!CacheFactory.get('jobCache'))
    {
        CacheFactory.createCache('jobCache', {
            deleteOnExpire: 'aggressive',
            recycleFreq: 60000,
            storageMode: 'localStorage'
        });
    }

    var jobCache  = CacheFactory.get('jobCache');

    return{
        getLocations: getLocations,
        saveJobProfile: saveJobProfile,
        getJobProfile: getJobProfile,
        getLookupJobAttributes:getLookupJobAttributes,
        sendMessageToAgent: sendMessageToAgent,
        callDevice: callDevice

    };

    /**
     * Call android client
     * @param data
     * @param status
     */
    function callDevice(data, status)
    {
        if(typeof Android !== 'undefined')
            Android.onComplete(data, status);
    }

    function sendMessageToAgent(messageText)
    {
        var data =
        {
            companyId: 6102,
            messageText: messageText
        };


        var request = $http({
            method : 'POST',
            url : '/mobileapp/v4/hiddenmessage.json',
            data: data
        });
        return request;

    }

    function getLocations()
    {

        var cities = $http.get("/api/mobile/chat/cities.json",  {cache: jobCache});
        return cities;


    }

    function saveJobProfile(data)
    {

        var request = $http({
            method : 'POST',
            url : '/mobileapp/v4/jobprofile.json',
            data: data
        });
        return request;
    }

    function getJobProfile()
    {
        var req = $http.get("/mobileapp/v4/jobprofile.json");
        return req;

    }
    function getLookupJobAttributes()
    {
        var attributes = $http.get("/mobileapp/v4/lookup/job/attributes.json");
        return attributes;

    }

});
