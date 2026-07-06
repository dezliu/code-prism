package grpcserver

import (
	"context"
	"fmt"
	"net"

	"github.com/lingprism/core/internal/application"
	"google.golang.org/grpc"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/wrapperspb"
)

const coreServiceName = "core.v1.CoreService"

type coreServiceServer struct {
	ping *application.PingService
}

// coreServiceAPI is the service interface required by grpc.ServiceDesc.HandlerType.
type coreServiceAPI interface {
	Ping(context.Context, *emptypb.Empty) (*wrapperspb.StringValue, error)
}

var coreServiceDesc = grpc.ServiceDesc{
	ServiceName: coreServiceName,
	HandlerType: (*coreServiceAPI)(nil),
	Methods: []grpc.MethodDesc{
		{
			MethodName: "Ping",
			Handler:    corePingHandler,
		},
	},
	Streams:  []grpc.StreamDesc{},
	Metadata: "core/v1/core.proto",
}

func (s *coreServiceServer) Ping(_ context.Context, _ *emptypb.Empty) (*wrapperspb.StringValue, error) {
	return wrapperspb.String(s.ping.Ping()), nil
}

func corePingHandler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(emptypb.Empty)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(*coreServiceServer).Ping(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/" + coreServiceName + "/Ping",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(*coreServiceServer).Ping(ctx, req.(*emptypb.Empty))
	}
	return interceptor(ctx, in, info, handler)
}

func Register(server *grpc.Server, ping *application.PingService) {
	server.RegisterService(&coreServiceDesc, &coreServiceServer{ping: ping})
}

func Start(port int, ping *application.PingService) (*grpc.Server, error) {
	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		return nil, fmt.Errorf("listen grpc: %w", err)
	}

	srv := grpc.NewServer()
	Register(srv, ping)

	go func() {
		if err := srv.Serve(lis); err != nil {
			fmt.Printf(`{"level":"error","msg":"grpc serve failed","error":%q}`+"\n", err.Error())
		}
	}()

	return srv, nil
}
