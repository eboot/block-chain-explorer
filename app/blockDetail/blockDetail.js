(function($window) {
  'use strict';
  var blockDetailPage = angular.module('myApp.blockDetailPage', ['ngRoute', 'blockExplorerServices']);

  blockDetailPage.config(['$routeProvider', function($routeProvider) {
    $routeProvider.when('/Block/:blockHash', {
      templateUrl: 'blockDetail/blockDetail.html',
      controller: 'BlockDetailPageCtrl',
    });
  }]);

  blockDetailPage.controller('BlockDetailPageCtrl', ['$scope', '$routeParams', 'BlockService', function($scope, $routeParams, BlockService) {
    var self = this;

    self.verificationStatus = 'Unverified';

    this.verifyBlock = function () {
      if (self.block == undefined) {
        return;
      }

      BlockService.verifyBlock(self.block).then (function (isValid) {
        $scope.$apply(function() {

          if (isValid === 'true') {
            self.verificationStatus = 'Valid';
          }
          else {
            self.verificationStatus = 'Invalid';
          }
        });
      },
      function (error) {
        console.log('error');
        console.log(error);
        self.verificationStatus = 'Unverified';
      });
    };


    BlockService.getBlock($routeParams.blockHash).then(function(block) {
      $scope.$apply(function() {
        self.block = block;
        self.verificationStatus = 'Unverified';
      });
    }).then(function() {    
      $scope.$apply(function() {
        self.rootHash = self.block.tx[0].hash;
      });  
    });
  }]);

  blockDetailPage.directive('transactionBrowser', function() {
    return {
      templateUrl: 'blockDetail/transactionBrowser.html',
      restrict: 'E',
      scope: {
        transactions: '=transactions',
        visualisationHash: '=visualisationHash'
      },
      controller: 'TrransactionBrowserController',
      controllerAs: 'controller',
    };
  });

  blockDetailPage.controller('TrransactionBrowserController', ['$scope', function($scope) {
    var vm = this;

    $scope.updateHash = function (newHash) {
      $scope.visualisationHash = newHash;
    };

    $scope.$watch(function() {
        return $scope.transactions;
      }, function() {

        if (!$scope.transactions) {
          return;
        }

        vm.transactions = $scope.transactions;

        if (vm.transactions.length === 0) {
         return;
        }

        vm.currentIndex = 0;
        vm.currentTransactionsFromIndex(vm.currentIndex, 10);
      });

      vm.currentTransactionsFromIndex = function (index, number) {
        vm.currentTransactions = vm.transactions.slice(index, index+number);
      };

      vm.previousTen = function () {
        if (vm.currentIndex < 10) {
          return;
        }

        vm.currentIndex -= 10;

        vm.currentTransactionsFromIndex(vm.currentIndex, 10);
      };

      vm.nextTen = function () {
        if (vm.currentIndex > vm.transactions.length-10) {
          return;
        }

        vm.currentIndex += 10;

        vm.currentTransactionsFromIndex(vm.currentIndex, 10);
      };

      vm.remainingTransactions = function() {
        if (!vm.transactions) {
          return;
        }

        return Math.min(vm.transactions.length, vm.currentIndex + 10);
      };
  }]);

  blockDetailPage.directive('visualisation', ['d3Service', 'BlockService', function(d3Service, BlockService) {
    return {
      restrict: 'EA',
      scope: {
        rootHash: "=rootHash",
      },
      link: function(scope, element, attrs) {

        var nodes = [], links = [], svg, force, height = 480, width = 640;

        d3Service.then(function(d3) {

          force = d3.layout.force();
          force.nodes(nodes);
          force.links(links);

          svg = d3.select('svg')
              .attr('width', width)
              .attr('height', height)
              .style('background-color', 'transparent')
              .style('overflow', 'visible');

              svg.append("g").attr("class", "tx-links");
              svg.append("g").attr("class", "tx-nodes");
        });

        var update = function () {
          if (!svg || !force) return;

          d3.selectAll("svg g.tx-nodes g").remove();
          d3.selectAll("svg g.tx-links line").remove();

          var link = svg.selectAll('g.tx-links').selectAll('.link').data(links);

          link.enter().append('line')
            .attr('class', 'link');

          link.exit().remove();

          var node = svg.selectAll('g.tx-nodes').selectAll('.node-group').data(nodes);
            
          // Enter selection.
          var groupEnter = node.enter().append('g');

          groupEnter
            .attr('class', 'node-group')
            .attr("tx-hash", function(d) { return d.hash; })
            .on('click', function (d) {
              scope.$apply(function() {
                scope.rootHash = d.hash; 
              });
            });

          groupEnter
             .append('circle')
             .attr('r', 20)
             .attr('class', 'node');

          groupEnter
             .append('text')
             .style("text-anchor", "middle")
             .attr("fill", "white");

            svg.selectAll('svg text').text(function (d) { 
              return d.hash.slice(0, 3); 
            });

          // Exit selection.
          node.exit().remove();


          
          
          force.on('tick', function() {

              node.attr('transform', function(d) { return "translate(" + d.x + ", " + d.y + ")"; });

              link.attr('x1', function(d) { return d.source.x; })
                  .attr('y1', function(d) { return d.source.y; })
                  .attr('x2', function(d) { return d.target.x; })
                  .attr('y2', function(d) { return d.target.y; });

          });

          force
          .size([width, height])
          .nodes(nodes)
          .links(links)
          .linkDistance(function(d) {
            return 15 / (1/d.layer);
          })
          .charge(-1800)
          .chargeDistance(140)
          .alpha(2);

          force.start();
        };

        scope.$watch(function() {
          return scope.rootHash;
        }, function() {

          if (scope.rootHash === undefined) return;

          BlockService.getTransactions(scope.rootHash, 3)
          .then(function (result) {

            var dataFromTree = function () {
              var index = 0;

              return function (parent, layer) {
                parent.uid = index;
                nodes.push(parent);

                if (parent.children.length === 0) {
                  return;
                }

                parent.children.forEach(function(element) {
                  index++;

                  links.push({  source : parent,
                                target : element,
                                layer : layer});

                  dataFromTree(element, layer+1);
                });
              };
            }();

            

            nodes.length = 0;
            links.length = 0;
            dataFromTree(result[0], 0);

            nodes.slice().splice(0, 1).forEach(function (element, index) {
              if (index === 0) {
                element.fixed = true;
                element.x = width/2;
                element.y = height/2;
              } else {
                element.y = 0;
                element.x = 0;  
              }
            });

            update();

          });

        });
      },
    };
  }]);

})(this);  
