/**
 * Created by TypeSDK on 2016/10/10.
 */
var crypto = require('crypto');
var request = require('request');
var merge = require('merge');
var logicCommon = require('./logicCommon.js');

function convertParamLogin(query,ret)
{
    var org =
    {
        "id" : "0"
        ,"token": ""
        ,"data":""
        ,"sign":""
    };
    var cloned = merge(true, org);
    merge(cloned,query);
    for(var i in cloned)
    {
        //判断参数中是否该有的字段齐全
        if(org[i] == cloned[i] && i != "data" && i != "id")
        {
            return false;
        }
        //判断参数中是否有为空的字段
        if(0 == (cloned[i] + "").replace(/(^s*)|(s*$)/g, "").length && i != "data" && i != "id")
        {
            return false;
        }
    }
    ret.uid = cloned.id;
    ret.token = cloned.token;
    return true;
}

function callChannelLogin(attrs,params,query,ret,retf)
{
    var cloned = merge(true, params.out_params);
    merge(cloned,query);
    cloned.uid = query.uid;
    cloned.appid = attrs.app_id;
    cloned.token = query.token;
    var options = {
        url: params.out_url,
        method:params.method,
        formData: cloned,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    };
    console.log(options);
    request(options, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var retOut = JSON.parse(body);
            if( retOut.ret == '0'){
                ret.code = 0;
                ret.msg = "NORMAL";
                ret.id = query.uid;
                ret.nick = "";
                ret.token = query.token;
                ret.value = retOut;
            }
            else
            {
                ret.code =  1;
                ret.msg = "LOGIN User ERROR";
                ret.id = "";
                ret.nick = "";
                ret.token = "";
                ret.value = retOut;
            }
        }
        else
        {
            ret.code = 2;
            ret.msg = "OUT URL ERROR";
            ret.value = "";
        }
        retf(ret);
    });
}

function compareOrder(attrs,gattrs,params,query,ret,game,channel,retfa){
    var retValue = {};
    retValue.code = 0;
    retValue.id = query.uid;
    retValue.order = query.orderid|| "";
    retValue.cporder =  query.extra.split("|")[0] || "";
    retValue.info = "";
    logicCommon.getNotifyUrl(retValue.cporder,params,function(hasData) {
        if (!hasData) {
            retfa('fail');
            return;
        } else {
            retValue.sign = logicCommon.createSignPay(retValue,gattrs.gkey);
            logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,1,0,query);
            var options = {
                url: params.verifyurl,
                method: "POST",
                body: retValue,
                json: true
            };
            request(options, function (error, response, body) {
                if(!error && response.statusCode == 200){
                    var retOut = body;
                    if (typeof retOut.code == 'undefined'){
                        retf('FAILURE');
                        return;
                    }
                    console.log(retOut);
                    if(retOut.code=='0'){
                        if(retOut.Itemid){
                            logicCommon.mapItemLists(attrs,retOut);
                        }
                        if(retValue.cporder==retOut.cporder
                            &&query.amount * 100>=retOut.amount*0.9
                            &&query.amount * 100<=retOut.amount){
                                if(retOut.status=='4'||retOut.status=='3'){
                                    logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,4,query.amount * 100);
                                    retfa('success');
                                    return;
                                }else{
                                    logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,2,0);

                                    ret.code = '0000';
                                    ret.msg = 'NORMAL';
                                    retfa(ret);
                                    return;
                                }
                        }else{
                            logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,3,0);
                            retfa('fail');
                            return;
                        }
                    }else{
                        retfa('fail');
                        return;
                    }
                }else{
                    retfa('fail');
                    return;
                }
            });
        }
    });
}

function callGamePay(attrs,gattrs,params,query,ret,retf,game,channel,channelId)
{
    var retValue = {};
    retValue.code = 0;
    retValue.id = query.uid;
    retValue.order = query.orderid|| "";
    retValue.cporder =  query.extra.split("|")[0] || "";
    retValue.info = "";
    logicCommon.getNotifyUrl(retValue.cporder,params,function(hasData){
        if(!hasData)
        {
            retf('FAILURE');
        }else{
            retValue.sign = logicCommon.createSignPay(retValue,gattrs.gkey);

            retValue.gamename = game;
            retValue.sdkname = channel;
            retValue.channel_id = channelId;
            retValue.amount = '' + query.amount * 100 + '';
            var options = {
                url: params.out_url,
                method: params.method,
                body: retValue,
                json: true
            };
            console.log(options);
            request(options, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    var retOut = body;
                    //日志记录CP端返回
                    console.log(retOut);
                    if (typeof retOut.code == 'undefined'){
                        retf('fail');
                    }
                    if (retOut.code == 0)
                    {
                        logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,4,query.amount * 100);
                        retf("success");
                    }
                    else {
                        retf('fail');
                    }
                }else
                {
                    retf('fail');
                }
            });
        }
    });
}

function checkSignPay(attrs,query)
{
    var osign = crypto.createHash('md5').update(
            attrs.app_key +
            "amount=" + query.amount + "&" +
            "extra=" + query.extra + "&" +
            "orderid=" + query.orderid  + "&" +
            "serverid=" + query.serverid + "&" +
            "ts=" + query.ts + "&" +
            "uid=" +query.uid).digest('hex');
    console.log(query.sign + " :: " + osign);
    if (query.sign != osign)
    {
        return false;
    }
    return true;

}

function checkOrder()
{
    return false;
}

/**
 * 核实外部订单号的唯一性
 * @param
 *      query   请求串Obj
 *      retf    返回校验结果 True 合法|False 不合法
 * */
function checkChOrder(game, channel,attrs, query, retf){
    var isIllegal = false;
    logicCommon.selCHOrderInRedis(channel,query.orderid|| "",function(res){
        if(!res || typeof res == "undefined"){
            logicCommon.saveCHOrderInRedis(game, channel, query.extra.split("|")[0] || "", query.orderid|| "",function(res){
                if(res && typeof res != "undefined"){
                    isIllegal = true;
                    retf(isIllegal);
                }else{
                    retf(isIllegal);
                }
            });
        }else{
            retf(isIllegal);
        }
    });
}

exports.convertParamLogin = convertParamLogin;
exports.callChannelLogin = callChannelLogin;
exports.checkSignPay = checkSignPay;
exports.callGamePay = callGamePay;
exports.checkOrder = checkOrder;
exports.compareOrder =compareOrder;
exports.checkChOrder = checkChOrder;