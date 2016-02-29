var CMSControllers = angular.module('CMSControllers', []);

function MasterCtrl(t,e){var g=992;t.getWidth=function(){return window.innerWidth},t.$watch(t.getWidth,function(o,n){o>=g?angular.isDefined(e.get("toggle"))?t.toggle=!!e.get("toggle"):t.toggle=!0:t.toggle=!1}),t.toggleSidebar=function(){t.toggle=!t.toggle,e.put("toggle",t.toggle)},window.onresize=function(){t.$apply()}};
CMSControllers.controller("MasterCtrl",["$scope","$cookieStore",MasterCtrl]);
