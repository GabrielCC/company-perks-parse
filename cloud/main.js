"use strict";
var mId = null;
var companyId = null;
var token = 'e8b545c7-da16-7876-b3c1-5b500b1a0096';
var deviceId = '07680317-e122-2f9a-8338-1ee2879b2fe8';
  
function getOrderList() {
    return Parse.Cloud.httpRequest({
        "url": 'https://apisandbox.dev.clover.com/v3/merchants/' + mId + '/orders',
        "params": {
            "filter": "device.id=" + deviceId
        },
        "method": "GET",
        "headers": {
            "Authorization": "Bearer " + token
        }
    }).then(function(httpResponse){
        return JSON.parse(httpResponse.text).elements;
    });
}
  
Parse.Cloud.define("getCompanies", function(request, response){
    var query = new Parse.Query("Discount");
    query.include("companyId");
    query.equalTo("merchantId", request.params.merchantId);
    query.find().then(function (results) {
        var companies = [];
        if(typeof results === "undefined" || results === null || results.length === 0){
            response.error("No companies for you!");
        }
        for(var i = 0; i < results.length; i++){
            companies.push({
                "companyId" : results[i].get("companyId").id,
                "name" :results[i].get("companyId").get("name")
            });
        }
        response.success(companies);
    });
});
  
  
  
// Use Parse.Cloud.define to define as many cloud functions as you want.
// For example:
Parse.Cloud.define("cloverDiscount", function (request, response) {
  
    function applyDiscount(order){
        var dscName = "Loyalty discount for " + responseMessage.companyName + " employee";
        return Parse.Cloud.httpRequest({
            "url": order.href + '/discounts',
            "method": "GET",
            "headers": {
                "Authorization": "Bearer " + token
            }
        }).then(function(httpResponse){
            var discounts = JSON.parse(httpResponse.text);
            if(typeof discounts.elements === "undefined" || discounts.elements.length < 1){
                return true;
            }
            for(var i = 0; i < discounts.elements.length; i++){
                if(discounts.elements[i].name === dscName || (discounts.elements[i].percentage + "") === responseMessage.discount){
                    return false;
                }
            }
        }).then(function(shouldApply){
            if(!shouldApply){
                return;
            }
            return Parse.Cloud.httpRequest({
                "url": order.href + '/discounts',
                "method": "POST",
                "headers": {
                    "Authorization": "Bearer " + token,
                    "Content-Type": "application/json;charset=utf-8"
                },
                "body" : {
                    "percentage" : responseMessage.discount,
                    "name" : dscName
                }
            })
        }).then(function(){
          return saveStatistic();
        });
    }

    function saveStatistic() {
      var weekNumber = getWeekNumber();
      var monthNumber = new Date();
      monthNumber = monthNumber.getMonth() + 1;
      var query = new Parse.Query("Statistic");
      query.equalTo("companyId", companyId);
      query.equalTo("merchantId", mId);
      query.equalTo("weekNumber", weekNumber);
      query.equalTo("monthNumber", monthNumber);
      return query.find().then(function (results) {
        if (typeof results === "undefined" || results.length === 0) {
          var statisticClass = Parse.Object.extend("Statistic");
          var statistic = new statisticClass();
          statistic.set("companyId", companyId);
          statistic.set("merchantId", mId);
          statistic.set("weekNumber", weekNumber);
          statistic.set("monthNumber", monthNumber);
          statistic.set("total", 1);
          return statistic.save();
        }else {
          var statistic = results[0];
          statistic.set('total', statistic.get('total') + 1);
          return statistic.save();
        }

      });
    }
    function getWeekNumber() {
        // Copy date so don't modify original
        var d = new Date();
        d.setHours(0,0,0);
        // Set to nearest Thursday: current date + 4 - current day number
        // Make Sunday's day number 7
        d.setDate(d.getDate() + 4 - (d.getDay()||7));
        // Get first day of year
        var yearStart = new Date(d.getFullYear(),0,1);
        // Calculate full weeks to nearest Thursday
        var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
        // Return array of year and week number
        return weekNo;
    }
  
    //search for card with employee
    var query = new Parse.Query("Card");
    var responseMessage = {
        "firstName": "",
        "lastName": "",
        "companyName": "",
        "discount": ""
    };
    mId = request.params.merchantId;
    /**
     * @todo uncomment this
     */
    //deviceId = request.params.deviceId;
    query.include("Employee");
    query.equalTo("qrCode", request.params.nfcId);
    query.find().then(function (results) {
        if (typeof results === "undefined" || results.length === 0) {
            errorMessage(response, 'Card not found', '404.1');
            return false;
        }
        var employee = results[0].get('employeeId');
        var query = new Parse.Query("Employee");
        query.include('companyId');
        return query.get(employee.id);
    }).then(function (employee) {
        var query;
        if (employee === false) {
            return false;
        }
        if (typeof employee === "undefined" || employee.length === 0) {
            errorMessage(response, 'Employee not found', '404.1');
            return false;
        }
        responseMessage.firstName = employee.get('firstName');
        responseMessage.lastName = employee.get('lastName');
        responseMessage.companyName = employee.get('companyId').get('name');
        query = new Parse.Query("Discount");
        query.equalTo("merchantId", mId);
        companyId = employee.get('companyId').id;
        query.equalTo("companyId", employee.get('companyId'));
        return query.find();
    }).then(function (discount) {
        if(discount === false){
            return false;
        }
        if (typeof discount === "undefined" || discount === null || discount.length < 1) {
            errorMessage(response, 'You have been fired. Sorry.', '404.3');
            return false;
        }
        responseMessage.discount = discount[0].get('discount') + "";
        return true;
    }).then(function (dsc) {
        if(dsc === false){
            return false;
        }
        return getOrderList();
    }).then(function(orders){
        var biggest = null;
        if(orders === false){
            return false;
        }
        if(typeof orders === "undefined" || orders === null || orders.length < 1){
            errorMessage(response, "No available orders", '404.2');
            return false;
        }
        for(var i = 0; i < orders.length; i++){
            if(orders[i].state !== "open"){
                continue;
            }
            if(biggest === null){
                biggest = orders[i];
                continue;
            }
            if(biggest.createdTime < orders[i].createdTime){
                biggest = orders[i];
            }
        }
        if(biggest === null) {
          errorMessage(response, "No available orders", '404.2');
          return false;
        }
        return applyDiscount(biggest);
    },function(e){
        errorMessage(response, "no available orders", '404.2');
    }).then(function(data){
        if(data === false){
            return false;
        }
        response.success(responseMessage);
    }, function(e){
        response.success(e);
    });
});
  
function errorMessage(response, message, code) {
    response.error(JSON.stringify({
        "message" : message,
        "code" : code
    }));
}